// ─────────────────────────────────────────────
// WorkflowEngine — 工作流执行引擎
// 职责：逐节点执行工作流，管理变量/引用/控制流
// ─────────────────────────────────────────────

import type { Workflow, WorkflowNode, WorkflowEdge } from '@automan/shared/types.js'
import { logger } from '../../core/logger.js'
import { resolveValue, evaluateCondition } from './refResolver.js'
import { toActualPoint, toActualRegion, type ScaleFactor } from '../device/coordinate.js'
import { findPicPro } from '../../libs/find-pic-pro.js'
import { getWords, findStr } from '../../libs/ocr.js'
import { adbClick, adbAreaClick } from '../../libs/adb-click.js'
import { adbSwipe } from '../../libs/adb-swipe.js'
import { adbLaunchApp, adbKillApp, adbIsAppRunning } from '../../libs/adb-app.js'

// ── 工具函数 ─────────────────────────────────

/** 从 data URL (base64 PNG) 解析图片尺寸 */
function parsePngSizeFromDataUrl(dataUrl: string): { width: number; height: number } {
  const commaIdx = dataUrl.indexOf(',')
  const raw = commaIdx === -1 ? dataUrl : dataUrl.slice(commaIdx + 1)
  const buf = Buffer.from(raw.slice(0, 32), 'base64')
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  return { width: 0, height: 0 }
}

function nodeLabel(node: WorkflowNode): string {
  return node.label || node.type
}

function clamp(v: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(v)))
}

function clampRegion(r: [number, number, number, number], maxW: number, maxH: number): [number, number, number, number] {
  return [clamp(r[0], maxW), clamp(r[1], maxH), clamp(r[2], maxW), clamp(r[3], maxH)]
}

function clampPoint(x: number, y: number, maxW: number, maxH: number): [number, number] {
  return [clamp(x, maxW), clamp(y, maxH)]
}

/**
 * 解析 region 参数：支持数组格式和字符串格式（含引用）
 * 支持 {{var:name}} 变量池引用
 */
function resolveRegion(
  val: unknown,
  outputs: Record<string, Record<string, unknown>>,
  variables?: Record<string, unknown>,
): [number, number, number, number] {
  if (Array.isArray(val) && val.length === 4) {
    return val.map(Number) as [number, number, number, number]
  }
  if (typeof val === 'string') {
    const resolved = resolveValue(val, outputs, variables)
    const str = String(resolved)
    const parts = str.split(',').map((s) => Number(s.trim()))
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      return parts as [number, number, number, number]
    }
  }
  return [0, 0, 0, 0]
}

/** 构建邻接表和节点映射 */
function buildAdj(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const adj = new Map<string, Map<string | undefined, string>>()
  const nodeMap = new Map<string, WorkflowNode>()
  for (const node of nodes) nodeMap.set(node.id, node)
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Map())
    adj.get(edge.source)!.set(edge.sourceHandle ?? undefined, edge.target)
  }
  return { adj, nodeMap }
}

// ── 类型定义 ─────────────────────────────────

export interface RawAnnotation {
  type: 'bbox' | 'click' | 'area' | 'text' | 'swipe'
  nodeId: string
  label: string
  data: Record<string, unknown>
}

export interface EngineContext {
  outputs: Record<string, Record<string, unknown>>
  variables: Record<string, unknown>
  screenshot: string
  deviceId: string
  adbPath: string
  adbTarget: string
  scaleFactor: ScaleFactor
  annotations: RawAnnotation[]
  screenshotWidth: number
  screenshotHeight: number
  shouldCancel?: () => boolean
  /** 当前是否在片段内执行（影响 return 节点行为） */
  inFragment?: boolean
  /** 片段调用栈深度（防递归爆炸） */
  callDepth?: number
  fragmentLoader?: (fragmentId: string) => Promise<{
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    inputs: Array<{ name: string; type: string; defaultValue?: string }>
    outputs: Array<{ name: string; type: string; defaultValue?: string }>
  } | null>
}

export interface ExecutionResult {
  success: boolean | undefined
  variables: Record<string, unknown>
  outputSummary: Record<string, Record<string, unknown>>
  error?: string
  stepsExecuted: number
}

export type LogFn = (level: string, message: string) => void

/** 节点执行结果（内部流转用） */
interface NodeExecResult {
  action: 'continue' | 'end' | 'endSuccess' | 'endFail' | 'return' | 'done' | 'error'
  nextNodeId?: string
  returnValues?: Record<string, unknown>
  error?: string
  steps: number
}

const MAX_GLOBAL_STEPS = 5000
const MAX_CALL_DEPTH = 10

// ── 引擎主类 ─────────────────────────────────

export class WorkflowEngine {
  async execute(workflow: Workflow, ctx: EngineContext, log?: LogFn): Promise<ExecutionResult> {
    const { nodes, edges } = workflow
    if (nodes.length === 0) return { success: true, variables: ctx.variables, outputSummary: {}, stepsExecuted: 0 }

    const { adj, nodeMap } = buildAdj(nodes, edges)
    const startNode = nodes.find((n) => n.type === 'start')
    if (!startNode) return { success: false, variables: ctx.variables, outputSummary: {}, error: '缺少开始节点', stepsExecuted: 0 }

    const emit = log ?? ((l: string, m: string) => logger.info('WorkflowEngine', `[${l}] ${m}`))
    let currentNodeId: string | undefined = this.followEdge(startNode.id, undefined, adj)
    let steps = 0

    while (currentNodeId && steps < MAX_GLOBAL_STEPS) {
      if (ctx.shouldCancel?.()) {
        return { success: false, variables: ctx.variables, outputSummary: ctx.outputs, error: '用户手动停止', stepsExecuted: steps }
      }
      const node = nodeMap.get(currentNodeId)
      if (!node) break

      const result = await this.executeNode(node, ctx, emit, adj, nodeMap, steps)
      steps = result.steps

      switch (result.action) {
        case 'continue':
          currentNodeId = result.nextNodeId
          break
        case 'end':
          return { success: undefined, variables: ctx.variables, outputSummary: ctx.outputs, stepsExecuted: steps }
        case 'endSuccess':
          return { success: true, variables: ctx.variables, outputSummary: ctx.outputs, stepsExecuted: steps }
        case 'endFail':
          return { success: false, variables: ctx.variables, outputSummary: ctx.outputs, error: result.error ?? '流程显式标记失败', stepsExecuted: steps }
        case 'return':
          currentNodeId = result.nextNodeId
          break
        case 'done':
          return { success: true, variables: ctx.variables, outputSummary: ctx.outputs, stepsExecuted: steps }
        case 'error':
          return { success: false, variables: ctx.variables, outputSummary: ctx.outputs, error: result.error, stepsExecuted: steps }
      }
    }

    if (steps >= MAX_GLOBAL_STEPS) {
      return { success: false, variables: ctx.variables, outputSummary: ctx.outputs, error: `执行步数超过上限 ${MAX_GLOBAL_STEPS}`, stepsExecuted: steps }
    }
    return { success: true, variables: ctx.variables, outputSummary: ctx.outputs, stepsExecuted: steps }
  }

  // ── 核心调度：统一节点执行入口 ────────────────

  private async executeNode(
    node: WorkflowNode, ctx: EngineContext, emit: LogFn,
    adj: Map<string, Map<string | undefined, string>>,
    nodeMap: Map<string, WorkflowNode>,
    steps: number,
    fragmentOutputs?: Array<{ name: string; type: string; defaultValue?: string }>,
  ): Promise<NodeExecResult> {
    if (ctx.shouldCancel?.()) return { action: 'error', error: '用户手动停止', steps }
    steps++
    const next = (handle?: string) => this.followEdge(node.id, handle, adj)

    try {
      switch (node.type) {
        case 'start':
          return { action: 'continue', nextNodeId: next(), steps }
        case 'end':
          return { action: 'end', steps }
        case 'endSuccess':
          return { action: 'endSuccess', steps }
        case 'endFail':
          return { action: 'endFail', error: '流程显式标记失败', steps }

        case 'variable':
          this.execVariable(node, ctx)
          return { action: 'continue', nextNodeId: next(), steps }

        case 'condition': {
          const r = this.evalCondition(node, ctx)
          ctx.outputs[node.id] = { result: r }
          emit('info', `[${nodeLabel(node)}] ${r}`)
          return { action: 'continue', nextNodeId: next(r ? 'true' : 'false'), steps }
        }

        case 'loop':
          return this.execLoop(node, adj, nodeMap, ctx, emit, steps, fragmentOutputs)

        case 'call': {
          const cr = await this.execCall(node, ctx, emit, steps)
          if (cr.error) return { action: 'error', error: cr.error, steps: cr.steps }
          return { action: 'continue', nextNodeId: next(), steps: cr.steps }
        }

        case 'return':
          if (ctx.inFragment) {
            // 片段内：解析输出值（支持 return 嵌套在 loop 等结构中）
            let returnValues: Record<string, unknown> | undefined
            if (fragmentOutputs && fragmentOutputs.length > 0) {
              returnValues = {}
              for (const param of fragmentOutputs) {
                const rawVal = node.config[param.name]
                returnValues[param.name] = resolveValue(rawVal, ctx.outputs, ctx.variables)
              }
            }
            return { action: 'return', returnValues, steps }
          }
          // 工作流级别：无意义，发出警告并继续
          emit('warn', `[${nodeLabel(node)}] return 节点只能在片段中使用`)
          return { action: 'continue', nextNodeId: next(), steps }

        case 'findPic':
          await this.execFindPic(node, ctx, emit)
          return { action: 'continue', nextNodeId: next(), steps }
        case 'ocrWords':
          await this.execOcrWords(node, ctx, emit)
          return { action: 'continue', nextNodeId: next(), steps }
        case 'ocrFindStr':
          await this.execOcrFindStr(node, ctx, emit)
          return { action: 'continue', nextNodeId: next(), steps }

        case 'click':
          await this.execClick(node, ctx, emit)
          return { action: 'continue', nextNodeId: next(), steps }
        case 'areaClick':
          await this.execAreaClick(node, ctx, emit)
          return { action: 'continue', nextNodeId: next(), steps }
        case 'swipe':
          await this.execSwipe(node, ctx, emit)
          return { action: 'continue', nextNodeId: next(), steps }

        case 'delay': {
          const ms = Number(node.config.ms ?? 1000)
          emit('info', `[${nodeLabel(node)}] ${ms}ms`)
          await new Promise<void>((r) => setTimeout(r, ms))
          return { action: 'continue', nextNodeId: next(), steps }
        }

        case 'randomDelay': {
          const rawL = Number(resolveValue(node.config.left, ctx.outputs, ctx.variables) ?? 0)
          const rawR = Number(resolveValue(node.config.right, ctx.outputs, ctx.variables) ?? 1000)
          const left = Math.max(0, Math.min(rawL, rawR))
          const right = Math.max(left, rawR)
          const actualMs = Math.floor(Math.random() * (right - left + 1)) + left
          ctx.outputs[node.id] = { actualMs }
          emit('info', `[${nodeLabel(node)}] ${actualMs}ms`)
          await new Promise<void>((r) => setTimeout(r, actualMs))
          return { action: 'continue', nextNodeId: next(), steps }
        }

        case 'launchApp': {
          const pkg = resolveValue(node.config.packageName, ctx.outputs, ctx.variables) as string
          if (!pkg) throw new Error('启动应用节点缺少包名')
          emit('info', `[${nodeLabel(node)}] ${pkg}`)
          try { await adbLaunchApp(ctx.adbPath, ctx.adbTarget, pkg) }
          catch (e) { emit('warn', `[${nodeLabel(node)}] 失败: ${e instanceof Error ? e.message : String(e)}`) }
          return { action: 'continue', nextNodeId: next(), steps }
        }

        case 'killApp': {
          const pkg = resolveValue(node.config.packageName, ctx.outputs, ctx.variables) as string
          if (!pkg) throw new Error('关闭应用节点缺少包名')
          emit('info', `[${nodeLabel(node)}] ${pkg}`)
          try { await adbKillApp(ctx.adbPath, ctx.adbTarget, pkg) }
          catch (e) { emit('warn', `[${nodeLabel(node)}] 失败: ${e instanceof Error ? e.message : String(e)}`) }
          return { action: 'continue', nextNodeId: next(), steps }
        }

        case 'restartApp': {
          const pkg = resolveValue(node.config.packageName, ctx.outputs, ctx.variables) as string
          if (!pkg) throw new Error('重启应用节点缺少包名')
          emit('info', `[${nodeLabel(node)}] ${pkg}`)
          try {
            await adbKillApp(ctx.adbPath, ctx.adbTarget, pkg)
            await new Promise<void>((r) => setTimeout(r, 1000))
            await adbLaunchApp(ctx.adbPath, ctx.adbTarget, pkg)
          } catch (e) { emit('warn', `[${nodeLabel(node)}] 失败: ${e instanceof Error ? e.message : String(e)}`) }
          return { action: 'continue', nextNodeId: next(), steps }
        }

        case 'appRunning': {
          const pkg = resolveValue(node.config.packageName, ctx.outputs, ctx.variables) as string
          if (!pkg) throw new Error('应用状态节点缺少包名')
          const running = await adbIsAppRunning(ctx.adbPath, ctx.adbTarget, pkg)
          emit('info', `[${nodeLabel(node)}] ${running}`)
          ctx.outputs[node.id] = { running }
          return { action: 'continue', nextNodeId: next(running ? 'true' : 'false'), steps }
        }

        case 'dice': {
          const value = Math.floor(Math.random() * 6) + 1
          emit('info', `[${nodeLabel(node)}] ${value}`)
          ctx.outputs[node.id] = { value }
          return { action: 'continue', nextNodeId: next(), steps }
        }

        case 'log': {
          const msg = String(resolveValue(node.config.message, ctx.outputs, ctx.variables) ?? '')
          emit('info', `[${nodeLabel(node)}] ${msg}`)
          return { action: 'continue', nextNodeId: next(), steps }
        }

        default:
          emit('warn', `未知节点类型: ${node.type}`)
          return { action: 'continue', nextNodeId: next(), steps }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit('error', `[${nodeLabel(node)}] 失败: ${msg}`)
      return { action: 'error', error: msg, steps }
    }
  }

  // ── 控制流 ─────────────────────────────────

  private followEdge(sourceId: string, handle: string | undefined, adj: Map<string, Map<string | undefined, string>>): string | undefined {
    const edges = adj.get(sourceId)
    if (!edges) return undefined
    return edges.get(handle ?? undefined) ?? edges.get(undefined)
  }

  /** 执行 loop 节点：使用统一 executeNode，自动支持所有节点类型 */
  private async execLoop(
    loopNode: WorkflowNode,
    adj: Map<string, Map<string | undefined, string>>,
    nodeMap: Map<string, WorkflowNode>,
    ctx: EngineContext,
    emit: LogFn,
    startSteps: number,
    fragmentOutputs?: Array<{ name: string; type: string; defaultValue?: string }>,
  ): Promise<NodeExecResult> {
    const maxIter = Number(loopNode.config.maxIter ?? 100)
    let iter = 0
    let steps = startSteps

    while (iter < maxIter && steps < MAX_GLOBAL_STEPS) {
      if (!this.evalCondition(loopNode, ctx)) {
        return { action: 'continue', nextNodeId: this.followEdge(loopNode.id, 'exit', adj), steps }
      }

      emit('info', `[${nodeLabel(loopNode)}] #${iter + 1}`)
      iter++
      steps++

      // 执行 body 链（统一使用 executeNode）
      let nodeId = this.followEdge(loopNode.id, 'body', adj)
      while (nodeId && nodeId !== loopNode.id && steps < MAX_GLOBAL_STEPS) {
        if (ctx.shouldCancel?.()) return { action: 'error', error: '用户手动停止', steps }

        const innerNode = nodeMap.get(nodeId)
        if (!innerNode) return { action: 'done', steps }

        const result = await this.executeNode(innerNode, ctx, emit, adj, nodeMap, steps, fragmentOutputs)
        steps = result.steps

        switch (result.action) {
          case 'continue':
            nodeId = result.nextNodeId
            break
          case 'end':
            return { action: 'end', steps }
          case 'endSuccess':
            return { action: 'endSuccess', steps }
          case 'endFail':
            return { action: 'endFail', error: result.error, steps }
          case 'return':
            return { action: 'return', returnValues: result.returnValues, steps }
          case 'done':
            return { action: 'done', steps }
          case 'error':
            return { action: 'error', error: result.error, steps }
        }
      }
      // body 链结束，回到 loop 重新评估
    }

    emit('warn', `loop 达到最大迭代 ${maxIter}`)
    return { action: 'continue', nextNodeId: this.followEdge(loopNode.id, 'exit', adj), steps }
  }

  /** 执行 call 节点：加载片段 → 变量隔离 → 执行 → 收集输出 */
  private async execCall(
    callNode: WorkflowNode, ctx: EngineContext, emit: LogFn, startSteps: number,
  ): Promise<{ steps: number; error?: string }> {
    const fragmentId = callNode.config.fragmentId as string
    if (!fragmentId) return { steps: startSteps, error: `[${nodeLabel(callNode)}] 未选择片段` }
    if (!ctx.fragmentLoader) return { steps: startSteps, error: `[${nodeLabel(callNode)}] 片段加载器未初始化` }

    const frag = await ctx.fragmentLoader(fragmentId)
    if (!frag) return { steps: startSteps, error: `[${nodeLabel(callNode)}] 片段 ${fragmentId} 不存在` }

    emit('info', `[${nodeLabel(callNode)}] 调用片段: ${fragmentId}`)

    // 递归深度检测
    const callDepth = (ctx.callDepth ?? 0) + 1
    if (callDepth > MAX_CALL_DEPTH) {
      return { steps: startSteps, error: `[${nodeLabel(callNode)}] 片段调用深度超过上限 ${MAX_CALL_DEPTH}，可能存在循环引用` }
    }
    ctx.callDepth = callDepth

    // 变量隔离（浅拷贝，当前变量均为基本类型）
    const savedVars = { ...ctx.variables }
    const savedOutputs = { ...ctx.outputs }
    const savedInFragment = ctx.inFragment

    // 注入输出参数默认值
    for (const param of frag.outputs) {
      ctx.variables[param.name] = param.defaultValue ?? (param.type === 'number' ? 0 : '')
    }
    // 注入输入参数
    for (const param of frag.inputs) {
      const rawArg = callNode.config[`arg_${param.name}`]
      const resolved = rawArg !== undefined && rawArg !== ''
        ? resolveValue(rawArg, savedOutputs, savedVars)
        : param.defaultValue
      ctx.variables[param.name] = resolved
    }

    // 片段使用独立的 outputs，防止 ID 碰撞
    ctx.outputs = {}
    ctx.inFragment = true

    const { adj: fragAdj, nodeMap: fragNodeMap } = buildAdj(frag.nodes, frag.edges)
    const execResult = await this.executeFragment(frag, fragAdj, fragNodeMap, ctx, emit, callNode, startSteps)

    // 恢复父级状态
    ctx.outputs = savedOutputs
    ctx.variables = savedVars
    ctx.inFragment = savedInFragment
    ctx.callDepth = callDepth - 1

    if (execResult.error) {
      return { steps: execResult.steps, error: execResult.error }
    }

    // 写入 call 节点的输出
    ctx.outputs[callNode.id] = execResult.returnValues ?? {}
    return { steps: execResult.steps }
  }

  /**
   * 执行片段内部流程（call 节点和循环体内共用）
   * 通过 return 节点收集输出，自然结束时从变量中提取
   */
  private async executeFragment(
    frag: { outputs: Array<{ name: string; type: string; defaultValue?: string }> },
    fragAdj: Map<string, Map<string | undefined, string>>,
    fragNodeMap: Map<string, WorkflowNode>,
    ctx: EngineContext,
    emit: LogFn,
    callNode: WorkflowNode,
    startSteps: number,
  ): Promise<{ steps: number; returnValues?: Record<string, unknown>; error?: string }> {
    const startNode = fragNodeMap.size > 0
      ? [...fragNodeMap.values()].find((n) => n.type === 'start')
      : undefined
    if (!startNode) {
      return { steps: startSteps, error: `[${nodeLabel(callNode)}] 片段缺少 start 节点` }
    }

    let nodeId: string | undefined = this.followEdge(startNode.id, undefined, fragAdj)
    let steps = startSteps

    while (nodeId && steps < MAX_GLOBAL_STEPS) {
      if (ctx.shouldCancel?.()) return { steps, error: '用户手动停止' }

      const innerNode = fragNodeMap.get(nodeId)
      if (!innerNode) break

      const result = await this.executeNode(innerNode, ctx, emit, fragAdj, fragNodeMap, steps, frag.outputs)
      steps = result.steps

      switch (result.action) {
        case 'continue':
          nodeId = result.nextNodeId
          break
        case 'return': {
          // 优先使用已解析的返回值（支持 return 嵌套在 loop 等结构中）
          if (result.returnValues !== undefined) {
            return { steps, returnValues: result.returnValues }
          }
          // 兜底：从 return 节点的 config 中解析各输出值
          const outputs: Record<string, unknown> = {}
          for (const param of frag.outputs) {
            const rawVal = innerNode.config[param.name]
            outputs[param.name] = resolveValue(rawVal, ctx.outputs, ctx.variables)
          }
          emit('info', `[片段返回] ${JSON.stringify(outputs)}`)
          return { steps, returnValues: outputs }
        }
        case 'end': {
          const outputs: Record<string, unknown> = {}
          for (const param of frag.outputs) {
            if (param.name in ctx.variables) outputs[param.name] = ctx.variables[param.name]
          }
          return { steps, returnValues: outputs }
        }
        case 'endSuccess':
        case 'endFail':
        case 'done': {
          const outputs: Record<string, unknown> = {}
          for (const param of frag.outputs) {
            if (param.name in ctx.variables) outputs[param.name] = ctx.variables[param.name]
          }
          return { steps, returnValues: outputs }
        }
        case 'error':
          return { steps, error: result.error }
      }
    }

    // 自然终止（无边可走）
    if (steps >= MAX_GLOBAL_STEPS) {
      return { steps, error: `片段执行步数超过上限 ${MAX_GLOBAL_STEPS}` }
    }
    const outputs: Record<string, unknown> = {}
    for (const param of frag.outputs) {
      if (param.name in ctx.variables) outputs[param.name] = ctx.variables[param.name]
    }
    return { steps, returnValues: outputs }
  }

  // ── 节点执行方法 ────────────────────────────

  private execVariable(node: WorkflowNode, ctx: EngineContext): void {
    const { name, scope, action, operand, value } = node.config as Record<string, unknown>
    const varName = String(name ?? '')
    if (!varName) return

    const current = ctx.variables[varName]
    const toNum = (v: unknown): number => Number(resolveValue(v, ctx.outputs, ctx.variables)) || 0
    let result: unknown

    switch (action) {
      case 'createOrSet':
        result = (varName in ctx.variables) ? current : resolveValue(value, ctx.outputs, ctx.variables)
        break
      case 'set':
        result = resolveValue(value, ctx.outputs, ctx.variables)
        break
      case 'add':
        result = (Number(current) || 0) + toNum(operand)
        break
      case 'sub':
        result = (Number(current) || 0) - toNum(operand)
        break
      case 'mul':
        result = (Number(current) || 0) * (toNum(operand) || 1)
        break
      case 'div': {
        const d = toNum(operand) || 1
        result = d === 0 ? 0 : (Number(current) || 0) / d
        break
      }
      default:
        result = current
    }

    ctx.variables[varName] = result
    ctx.outputs[node.id] = { value: result }
  }

  private evalCondition(node: WorkflowNode, ctx: EngineContext): boolean {
    const { left, operator, right } = node.config as Record<string, unknown>
    const l = resolveValue(left, ctx.outputs, ctx.variables)
    const r = resolveValue(right, ctx.outputs, ctx.variables)
    return evaluateCondition(l, String(operator), r)
  }

  // ── 动作节点执行方法 ──────────────────────────

  private async execFindPic(node: WorkflowNode, ctx: EngineContext, emit: LogFn): Promise<void> {
    const { templateImage, threshold, region } = node.config as Record<string, unknown>
    if (!templateImage) throw new Error('识图节点缺少模板图片')

    const searchRegion = clampRegion(
      resolveRegion(region, ctx.outputs, ctx.variables),
      ctx.screenshotWidth, ctx.screenshotHeight,
    )

    const resolvedTemplate = resolveValue(templateImage, ctx.outputs, ctx.variables)
    if (typeof resolvedTemplate !== 'string' || !resolvedTemplate.trim()) {
      throw new Error('识图节点模板图片无效')
    }
    if (resolvedTemplate.includes('{{')) {
      throw new Error(`识图节点模板图片引用未解析: ${resolvedTemplate}`)
    }

    const templateStr = resolvedTemplate
    const result = await findPicPro({
      image: ctx.screenshot,
      template: templateStr,
      threshold: Number(threshold ?? 80) / 100,
      region: searchRegion,
    })
    const first = result.matches[0]
    const { width: templateW, height: templateH } = parsePngSizeFromDataUrl(templateStr)

    ctx.outputs[node.id] = {
      matchCount: result.matches.length,
      matchX: first ? Math.round(first.x) : -1,
      matchY: first ? Math.round(first.y) : -1,
    }
    emit('info', `[${nodeLabel(node)}] ${result.matches.length}个匹配${first ? ` (${Math.round(first.x)},${Math.round(first.y)})` : ''}`)
    if (result.matches.length > 0) {
      ctx.annotations.push({
        type: 'bbox', nodeId: node.id, label: node.label || 'findPic',
        data: {
          templateW, templateH,
          matches: result.matches.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), confidence: m.confidence })),
        },
      })
    }
  }

  private async execOcrWords(node: WorkflowNode, ctx: EngineContext, emit: LogFn): Promise<void> {
    const { region } = node.config as Record<string, unknown>
    const searchRegion = clampRegion(
      resolveRegion(region, ctx.outputs, ctx.variables),
      ctx.screenshotWidth, ctx.screenshotHeight,
    )
    const result = await getWords({ image: ctx.screenshot, region: searchRegion })
    const text = result.words.map((w) => w.text).join('')
    ctx.outputs[node.id] = { text, wordCount: result.words.length }
    emit('info', `[${nodeLabel(node)}] ${result.words.length}字`)
  }

  private async execOcrFindStr(node: WorkflowNode, ctx: EngineContext, emit: LogFn): Promise<void> {
    const { target, similarity, region } = node.config as Record<string, unknown>
    if (!target) throw new Error('找字节点缺少目标文字')

    const searchRegion = clampRegion(
      resolveRegion(region, ctx.outputs, ctx.variables),
      ctx.screenshotWidth, ctx.screenshotHeight,
    )

    const result = await findStr({
      image: ctx.screenshot,
      target: String(target),
      similarity: Number(similarity ?? 80) / 100,
      region: searchRegion,
    })
    const first = result.matches[0]

    ctx.outputs[node.id] = {
      matchCount: result.matches.length,
      matchX: first ? Math.round(first.x) : -1,
      matchY: first ? Math.round(first.y) : -1,
    }
    emit('info', `[${nodeLabel(node)}] ${result.matches.length}个匹配${first ? ` "${first.text}"` : ''}`)
    if (result.matches.length > 0) {
      ctx.annotations.push({
        type: 'text', nodeId: node.id, label: node.label || 'ocrFindStr',
        data: {
          matches: result.matches.map((m) => ({
            x: Math.round(m.x), y: Math.round(m.y),
            w: Math.round(m.w || 0), h: Math.round(m.h || 0),
            text: m.text, similarity: m.similarity,
          })),
        },
      })
    }
  }

  private async execClick(node: WorkflowNode, ctx: EngineContext, emit: LogFn): Promise<void> {
    const rawX = Number(resolveValue(node.config.x, ctx.outputs, ctx.variables) ?? 0)
    const rawY = Number(resolveValue(node.config.y, ctx.outputs, ctx.variables) ?? 0)
    const [x, y] = clampPoint(rawX, rawY, ctx.screenshotWidth, ctx.screenshotHeight)
    const [actualX, actualY] = toActualPoint(x, y, ctx.scaleFactor)
    emit('info', `[${nodeLabel(node)}] ${actualX},${actualY}`)
    await adbClick(ctx.adbPath, ctx.adbTarget, [actualX, actualY])
    ctx.annotations.push({ type: 'click', nodeId: node.id, label: node.label || 'click', data: { x, y } })
  }

  private async execAreaClick(node: WorkflowNode, ctx: EngineContext, emit: LogFn): Promise<void> {
    const rawRegion = resolveRegion(node.config.region, ctx.outputs, ctx.variables)
    const region = clampRegion(rawRegion, ctx.screenshotWidth, ctx.screenshotHeight)
    const actualRegion = toActualRegion(region, ctx.scaleFactor)
    const cx = Math.round((region[0] + region[2]) / 2)
    const cy = Math.round((region[1] + region[3]) / 2)
    emit('info', `[${nodeLabel(node)}] ${cx},${cy}`)
    await adbAreaClick(ctx.adbPath, ctx.adbTarget, actualRegion)
    ctx.annotations.push({ type: 'area', nodeId: node.id, label: node.label || 'areaClick', data: { region, clickX: cx, clickY: cy } })
  }

  private async execSwipe(node: WorkflowNode, ctx: EngineContext, emit: LogFn): Promise<void> {
    const startRegion = clampRegion(
      resolveRegion(node.config.startRegion, ctx.outputs, ctx.variables),
      ctx.screenshotWidth, ctx.screenshotHeight,
    )
    const endRegion = clampRegion(
      resolveRegion(node.config.endRegion, ctx.outputs, ctx.variables),
      ctx.screenshotWidth, ctx.screenshotHeight,
    )
    const padding = Number(node.config.padding ?? 0)

    const actualStart = toActualRegion(startRegion, ctx.scaleFactor)
    const actualEnd = toActualRegion(endRegion, ctx.scaleFactor)
    const result = await adbSwipe(ctx.adbPath, ctx.adbTarget, actualStart, actualEnd, { padding })

    ctx.outputs[node.id] = {
      startX: result.startX, startY: result.startY,
      endX: result.endX, endY: result.endY, steps: result.steps,
    }
    emit('info', `[${nodeLabel(node)}] (${result.startX},${result.startY})→(${result.endX},${result.endY})`)
    ctx.annotations.push({
      type: 'swipe', nodeId: node.id, label: node.label || 'swipe',
      data: {
        startX: result.startX, startY: result.startY,
        endX: result.endX, endY: result.endY,
        trajectory: result.trajectory,
      },
    })
  }
}
