// ─────────────────────────────────────────────
// WorkflowEngine — 工作流执行引擎
// 职责：逐节点执行工作流，管理变量/引用/控制流
// ─────────────────────────────────────────────

import type { Workflow, WorkflowNode, WorkflowEdge } from '@automan/shared/types.js'
import { logger } from '../../core/logger.js'
import { resolveValue, evaluateCondition } from './refResolver.js'
import { findPicPro } from '../../libs/find-pic-pro.js'
import { getWords } from '../../libs/ocr.js'
import { findStr } from '../../libs/ocr.js'
import { adbClick, adbAreaClick } from '../../libs/adb-click.js'

/** 原始视觉注解（引擎层，不含工作流信息） */
export interface RawAnnotation {
  type: 'bbox' | 'click' | 'area' | 'text'
  nodeId: string
  label: string
  data: Record<string, unknown>
}

/** 引擎执行上下文 */
export interface EngineContext {
  outputs: Record<string, Record<string, unknown>>
  variables: Record<string, unknown>
  screenshot: string
  deviceId: string
  adbPath: string
  adbTarget: string
  annotations: RawAnnotation[]
  /** 压缩图尺寸 */
  screenshotWidth: number
  screenshotHeight: number
  /** 原始设备分辨率 */
  originalWidth: number
  originalHeight: number
}

/** 单次执行结果 */
export interface ExecutionResult {
  success: boolean
  variables: Record<string, unknown>
  outputSummary: Record<string, Record<string, unknown>>
  error?: string
  stepsExecuted: number
}

/** 执行过程中的日志回调 */
export type LogFn = (level: string, message: string) => void

/** 全局执行步数上限（防死循环） */
const MAX_GLOBAL_STEPS = 5000

export class WorkflowEngine {
  /**
   * 执行一次工作流
   * @param workflow 工作流定义（nodes + edges）
   * @param ctx 执行上下文
   * @param log 日志回调（可选）
   */
  async execute(workflow: Workflow, ctx: EngineContext, log?: LogFn): Promise<ExecutionResult> {
    const { nodes, edges } = workflow
    if (nodes.length === 0) return { success: true, variables: ctx.variables, outputSummary: {}, stepsExecuted: 0 }

    // 构建邻接表: sourceId → { handle? → targetId }
    const adj = new Map<string, Map<string | undefined, string>>()
    const nodeMap = new Map<string, WorkflowNode>()
    for (const node of nodes) nodeMap.set(node.id, node)
    for (const edge of edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, new Map())
      adj.get(edge.source)!.set(edge.sourceHandle ?? undefined, edge.target)
    }

    // 找 start 节点
    const startNode = nodes.find((n) => n.type === 'start')
    if (!startNode) return { success: false, variables: ctx.variables, outputSummary: {}, error: '缺少开始节点', stepsExecuted: 0 }

    const emit = log ?? ((l: string, m: string) => logger.info('WorkflowEngine', `[${l}] ${m}`))

    let currentNodeId: string | undefined = this.followEdge(startNode.id, undefined, adj)
    let steps = 0

    while (currentNodeId && steps < MAX_GLOBAL_STEPS) {
      const node = nodeMap.get(currentNodeId)
      if (!node) break

      emit('debug', `▶ ${node.type} [${node.id}]`)
      steps++

      try {
        switch (node.type) {
          case 'start':
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break

          case 'end':
            return { success: true, variables: ctx.variables, outputSummary: ctx.outputs, stepsExecuted: steps }

          case 'variable':
            this.execVariable(node, ctx)
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break

          case 'condition': {
            const result = this.evalCondition(node, ctx)
            emit('debug', `条件: ${result}`)
            currentNodeId = this.followEdge(node.id, result ? 'true' : 'false', adj)
            break
          }

          case 'loop': {
            const loopResult = await this.execLoop(node, nodes, edges, adj, nodeMap, ctx, emit, steps)
            steps = loopResult.steps
            currentNodeId = loopResult.nextNodeId
            break
          }

          case 'findPic':
            await this.execFindPic(node, ctx)
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break

          case 'ocrWords':
            await this.execOcrWords(node, ctx)
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break

          case 'ocrFindStr':
            await this.execOcrFindStr(node, ctx)
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break

          case 'click':
            await this.execClick(node, ctx)
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break

          case 'areaClick':
            await this.execAreaClick(node, ctx)
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break

          case 'delay': {
            const ms = Number(node.config.ms ?? 1000)
            emit('debug', `等待 ${ms}ms`)
            await new Promise<void>((r) => setTimeout(r, ms))
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break
          }

          default:
            emit('warn', `未知节点类型: ${node.type}`)
            currentNodeId = this.followEdge(node.id, undefined, adj)
            break
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        emit('error', `节点 ${node.type}[${node.id}] 执行失败: ${msg}`)
        return { success: false, variables: ctx.variables, outputSummary: ctx.outputs, error: msg, stepsExecuted: steps }
      }
    }

    if (steps >= MAX_GLOBAL_STEPS) {
      return { success: false, variables: ctx.variables, outputSummary: ctx.outputs, error: `执行步数超过上限 ${MAX_GLOBAL_STEPS}`, stepsExecuted: steps }
    }

    return { success: true, variables: ctx.variables, outputSummary: ctx.outputs, stepsExecuted: steps }
  }

  // ── 私有方法 ─────────────────────────────────

  /** 沿边查找下一个节点 */
  private followEdge(sourceId: string, handle: string | undefined, adj: Map<string, Map<string | undefined, string>>): string | undefined {
    const edges = adj.get(sourceId)
    if (!edges) return undefined
    const h = handle ?? undefined
    return edges.get(h) ?? edges.get(undefined)
  }

  /** 执行 variable 节点 */
  private execVariable(node: WorkflowNode, ctx: EngineContext): void {
    const { name, scope, action, operand, value } = node.config as Record<string, unknown>
    const varName = String(name ?? '')
    if (!varName) return

    // session 变量保持上次值，local 变量每次重置
    if (scope !== 'session' && !(varName in ctx.variables)) {
      ctx.variables[varName] = value !== undefined ? Number(value) || 0 : 0
    }

    const current = Number(ctx.variables[varName]) || 0
    let result: number

    switch (action) {
      case 'set':
        result = Number(resolveValue(value, ctx.outputs)) || 0
        break
      case 'add':
        result = current + (Number(resolveValue(operand, ctx.outputs)) || 0)
        break
      case 'sub':
        result = current - (Number(resolveValue(operand, ctx.outputs)) || 0)
        break
      case 'mul':
        result = current * (Number(resolveValue(operand, ctx.outputs)) || 1)
        break
      case 'div': {
        const d = Number(resolveValue(operand, ctx.outputs)) || 1
        result = d === 0 ? 0 : current / d
        break
      }
      case 'reset':
        result = 0
        break
      default:
        result = current
    }

    ctx.variables[varName] = result
    ctx.outputs[node.id] = { value: result }
  }

  /** 评估条件 */
  private evalCondition(node: WorkflowNode, ctx: EngineContext): boolean {
    const { left, operator, right } = node.config as Record<string, unknown>
    const l = resolveValue(left, ctx.outputs)
    const r = resolveValue(right, ctx.outputs)
    return evaluateCondition(l, String(operator), r)
  }

  /** 执行 loop 节点（含内层循环） */
  private async execLoop(
    loopNode: WorkflowNode,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    adj: Map<string, Map<string | undefined, string>>,
    nodeMap: Map<string, WorkflowNode>,
    ctx: EngineContext,
    emit: LogFn,
    startSteps: number,
  ): Promise<{ nextNodeId: string | undefined; steps: number }> {
    const maxIter = Number(loopNode.config.maxIter ?? 100)
    let iter = 0
    let steps = startSteps

    while (iter < maxIter && steps < MAX_GLOBAL_STEPS) {
      const condResult = this.evalCondition(loopNode, ctx)
      if (!condResult) {
        // 退出循环 → exit 出口
        return { nextNodeId: this.followEdge(loopNode.id, 'exit', adj), steps }
      }

      emit('debug', `loop #${iter + 1}`)
      iter++
      steps++

      // 执行 body 链
      let nodeId = this.followEdge(loopNode.id, 'body', adj)
      while (nodeId && nodeId !== loopNode.id && steps < MAX_GLOBAL_STEPS) {
        const innerNode = nodeMap.get(nodeId)
        if (!innerNode) break

        emit('debug', `  loop▶ ${innerNode.type} [${innerNode.id}]`)
        steps++

        switch (innerNode.type) {
          case 'variable':
            this.execVariable(innerNode, ctx)
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
          case 'condition': {
            const r = this.evalCondition(innerNode, ctx)
            nodeId = this.followEdge(innerNode.id, r ? 'true' : 'false', adj)
            break
          }
          case 'findPic':
            await this.execFindPic(innerNode, ctx)
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
          case 'ocrWords':
            await this.execOcrWords(innerNode, ctx)
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
          case 'ocrFindStr':
            await this.execOcrFindStr(innerNode, ctx)
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
          case 'click':
            await this.execClick(innerNode, ctx)
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
          case 'areaClick':
            await this.execAreaClick(innerNode, ctx)
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
          case 'delay': {
            const ms = Number(innerNode.config.ms ?? 1000)
            await new Promise<void>((r) => setTimeout(r, ms))
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
          }
          case 'end':
            return { nextNodeId: undefined, steps }
          default:
            nodeId = this.followEdge(innerNode.id, undefined, adj)
            break
        }
      }
      // body 链结束，回到 loop 重新评估
    }

    emit('warn', `loop 达到最大迭代 ${maxIter}`)
    return { nextNodeId: this.followEdge(loopNode.id, 'exit', adj), steps }
  }

  /**
   * 将原始分辨率 region 缩放到压缩图空间
   * [x1, y1, x2, y2] 原始 → [x1', y1', x2', y2'] 压缩
   */
  private scaleRegionToCompressed(
    region: [number, number, number, number],
    ctx: EngineContext,
  ): [number, number, number, number] {
    const sx = ctx.screenshotWidth / ctx.originalWidth
    const sy = ctx.screenshotHeight / ctx.originalHeight
    return [
      Math.round(region[0] * sx),
      Math.round(region[1] * sy),
      Math.round(region[2] * sx),
      Math.round(region[3] * sy),
    ]
  }

  /** 识图节点 */
  private async execFindPic(node: WorkflowNode, ctx: EngineContext): Promise<void> {
    const { templateImage, threshold, region } = node.config as Record<string, unknown>
    if (!templateImage) throw new Error('识图节点缺少模板图片')

    // region 参数为原始分辨率，缩放到压缩图空间
    const originalRegion = (region as [number, number, number, number]) ?? [0, 0, 0, 0]
    const compressedRegion = this.scaleRegionToCompressed(originalRegion, ctx)

    const result = await findPicPro({
      image: ctx.screenshot,
      template: String(templateImage),
      threshold: Number(threshold ?? 80) / 100,
      region: compressedRegion,
    })
    const first = result.matches[0]

    // 压缩图坐标 → 原始分辨率坐标
    const scaleX = ctx.originalWidth / ctx.screenshotWidth
    const scaleY = ctx.originalHeight / ctx.screenshotHeight

    ctx.outputs[node.id] = {
      matchCount: result.matches.length,
      matchX: first ? Math.round(first.x * scaleX) : -1,
      matchY: first ? Math.round(first.y * scaleY) : -1,
    }
    // 视觉注解：所有匹配点（转为原始分辨率坐标）
    if (result.matches.length > 0) {
      ctx.annotations.push({
        type: 'bbox',
        nodeId: node.id,
        label: node.label || 'findPic',
        data: {
          matches: result.matches.map((m) => ({
            x: Math.round(m.x * scaleX),
            y: Math.round(m.y * scaleY),
            confidence: m.confidence,
          })),
        },
      })
    }
  }

  /** OCR 识字节点 */
  private async execOcrWords(node: WorkflowNode, ctx: EngineContext): Promise<void> {
    const { region } = node.config as Record<string, unknown>
    const originalRegion = (region as [number, number, number, number]) ?? [0, 0, 0, 0]
    const compressedRegion = this.scaleRegionToCompressed(originalRegion, ctx)
    const result = await getWords({
      image: ctx.screenshot,
      region: compressedRegion,
    })
    const text = result.words.map((w) => w.text).join('')
    ctx.outputs[node.id] = { text, wordCount: result.words.length }
  }

  /** OCR 找字节点 */
  private async execOcrFindStr(node: WorkflowNode, ctx: EngineContext): Promise<void> {
    const { target, similarity, region } = node.config as Record<string, unknown>
    if (!target) throw new Error('找字节点缺少目标文字')

    // region 参数为原始分辨率，缩放到压缩图空间
    const originalRegion = (region as [number, number, number, number]) ?? [0, 0, 0, 0]
    const compressedRegion = this.scaleRegionToCompressed(originalRegion, ctx)

    const result = await findStr({
      image: ctx.screenshot,
      target: String(target),
      similarity: Number(similarity ?? 80) / 100,
      region: compressedRegion,
    })
    const first = result.matches[0]

    const scaleX = ctx.originalWidth / ctx.screenshotWidth
    const scaleY = ctx.originalHeight / ctx.screenshotHeight

    ctx.outputs[node.id] = {
      matchCount: result.matches.length,
      matchX: first ? Math.round(first.x * scaleX) : -1,
      matchY: first ? Math.round(first.y * scaleY) : -1,
    }
    // 视觉注解：匹配到的文字区域（转为原始分辨率坐标）
    if (result.matches.length > 0) {
      ctx.annotations.push({
        type: 'text',
        nodeId: node.id,
        label: node.label || 'ocrFindStr',
        data: {
          matches: result.matches.map((m) => ({
            x: Math.round(m.x * scaleX),
            y: Math.round(m.y * scaleY),
            w: Math.round((m.w || 0) * scaleX),
            h: Math.round((m.h || 0) * scaleY),
            text: m.text,
            similarity: m.similarity,
          })),
        },
      })
    }
  }

  /** 点击节点 */
  private async execClick(node: WorkflowNode, ctx: EngineContext): Promise<void> {
    const x = Number(node.config.x ?? 0)
    const y = Number(node.config.y ?? 0)
    await adbClick(ctx.adbPath, ctx.adbTarget, [x, y])
    ctx.annotations.push({
      type: 'click',
      nodeId: node.id,
      label: node.label || 'click',
      data: { x, y },
    })
  }

  /** 范围点击节点 */
  private async execAreaClick(node: WorkflowNode, ctx: EngineContext): Promise<void> {
    const region = (node.config.region as [number, number, number, number]) ?? [0, 0, 0, 0]
    await adbAreaClick(ctx.adbPath, ctx.adbTarget, region)
    const cx = Math.round((region[0] + region[2]) / 2)
    const cy = Math.round((region[1] + region[3]) / 2)
    ctx.annotations.push({
      type: 'area',
      nodeId: node.id,
      label: node.label || 'areaClick',
      data: { region, clickX: cx, clickY: cy },
    })
  }
}
