// ─────────────────────────────────────────────
// WorkflowActor — 工作流运行 Actor
// 职责：订阅截图事件 → 调用引擎执行 → busy 锁防并发
//       支持立即/定时触发模式 + 成功/失败计数 + 自动停止
// ─────────────────────────────────────────────

import { ActorBase } from '../actor/actor.base.js'
import type { Workflow, WorkflowRunConfig, FlowState } from '@automan/shared/types.js'
import { WorkflowEngine, type EngineContext, type ExecutionResult } from './engine.js'
import { eventBus, EventBusEvent } from '../../core/event-bus.js'
import type { ScreenshotEvent } from './screenshot.dispatcher.js'
import type { VisualAnnotation } from '@automan/shared/types.js'
import type { DeviceSession } from './device.session.js'
import { db, fragments } from '../../db/index.js'
import { eq } from 'drizzle-orm'

/** WorkflowActor 配置 */
export interface WorkflowActorConfig {
  runId: string
  workflow: Workflow
  deviceId: string
  session: DeviceSession
  /** 运行配置（触发方式、计数上限等） */
  runConfig: WorkflowRunConfig
}

export class WorkflowActor extends ActorBase {
  private readonly config: WorkflowActorConfig
  private readonly engine = new WorkflowEngine()
  private busy = false
  private cancelled = false
  private deviceReady = false
  private sessionVars: Record<string, unknown> = {}
  private executionCount = 0

  /** flow 执行状态机 */
  private flowState: FlowState = 'idle'
  /** 累计成功次数（仅 endSuccess 节点触发） */
  private successCount = 0
  /** 累计失败次数（仅 endFail 节点触发） */
  private failCount = 0

  /** 截图事件监听器（用于清理） */
  private screenshotHandler: ((event: ScreenshotEvent) => void) | null = null

  constructor(config: WorkflowActorConfig) {
    super(config.runId, `Workflow:${config.workflow.name}`)
    this.config = config
  }

  override async start(): Promise<void> {
    await super.start()

    // 订阅截图事件
    this.screenshotHandler = (event: ScreenshotEvent) => {
      if (event.deviceId === this.config.deviceId) {
        void this.onScreenshot(event)
      }
    }
    eventBus.on(EventBusEvent.SCREENSHOT_READY, this.screenshotHandler)

    this.sendLog('info', `workflow [${this.config.workflow.name}] started`)

    // 定时模式初始为"未激活（等待定时）"，并广播初始状态
    if (this.config.runConfig.triggerMode === 'scheduled') {
      this.flowState = 'inactive'
    }
    this.emitFlowState()
  }

  override async stop(): Promise<void> {
    // 先设置取消标记，让正在执行的引擎尽快退出
    this.cancelled = true

    // 取消截图订阅
    if (this.screenshotHandler) {
      eventBus.off(EventBusEvent.SCREENSHOT_READY, this.screenshotHandler)
      this.screenshotHandler = null
    }
    this.sendLog('info', `workflow [${this.config.workflow.name}] stopped (executed ${this.executionCount} times)`)
    await super.stop()
  }

  async receive(_msg: unknown): Promise<void> {
    // 消息已由 ActorManager 分发
  }

  /** 获取运行信息 */
  getInfo() {
    return {
      runId: this.config.runId,
      workflowId: this.config.workflow.id,
      deviceId: this.config.deviceId,
      busy: this.busy,
      state: this.getState(),
      executionCount: this.executionCount,
      flowState: this.flowState,
      cancelled: this.cancelled,
      successCount: this.successCount,
      failCount: this.failCount,
    }
  }

  /**
   * 定时模式专用：由 CronManager 回调调用
   * 定时信号 = 唤起 + 重置初始参数：
   *   - 无论当前 idle / completed / inactive，统一重置计数、取消标记、session 变量
   *   - 进入 pending（激活），等待下次截图执行
   *   - 正在执行中（busy）则不叠加、不打断，跳过本次唤醒
   */
  markPending(): void {
    // 正在执行中：不叠加、不打断，跳过本次唤醒
    if (this.busy) {
      this.sendLog('info', `定时信号到达，但任务正在执行中，跳过本次唤醒`)
      return
    }
    // 每次定时唤醒 = 全新激活：统一重置初始参数
    this.successCount = 0
    this.failCount = 0
    this.cancelled = false
    this.sessionVars = {}
    this.flowState = 'pending'
    this.sendLog('info', `定时信号到达：重置参数并唤醒，等待下次截图执行`)
    this.emitFlowState()
  }

  // ── 私有方法 ─────────────────────────────────

  /** 收到截图 → 根据触发模式决定是否执行工作流 */
  private async onScreenshot(event: ScreenshotEvent): Promise<void> {
    if (!this.isRunning()) return
    // 达标或已取消：不处理截图
    if (this.flowState === 'completed' || this.flowState === 'inactive' || this.cancelled) return
    if (this.busy) {
      // 忙时跳过截图
      return
    }

    // 触发模式判断
    const { triggerMode } = this.config.runConfig
    if (triggerMode === 'scheduled') {
      // 定时模式：仅 pending 状态才执行
      if (this.flowState !== 'pending') return
    }
    // 立即模式：每次都执行（fall through）

    // ★ busy 锁必须在 ensureReady 之前设置！
    this.busy = true
    this.executionCount++
    const runNum = this.executionCount
    this.flowState = 'processing'
    this.emitFlowState()

    try {
      // 等待设备就绪（仅首次有效，幂等）
      if (!this.deviceReady) {
        try {
          await this.config.session.ensureReady()
          this.deviceReady = true
        } catch (err) {
          this.sendLog('error', `设备就绪检测失败: ${err instanceof Error ? err.message : String(err)}，本次任务已停止`)
          this.cancelled = true
          this.flowState = 'fail'
          this.emitFlowState()
          return
        }
      }

      // 初始化 local 变量（每次重置），session 变量保留
      const variables = this.initVariables()

      const ctx: EngineContext = {
        outputs: {},
        variables,
        screenshot: event.image,
        deviceId: this.config.deviceId,
        adbPath: this.config.session.getAdbPath(),
        adbTarget: this.config.session.getAdbTarget(),
        scaleFactor: this.config.session.getScaleFactor(),
        annotations: [],
        screenshotWidth: event.width,
        screenshotHeight: event.height,
        shouldCancel: () => this.cancelled,
        fragmentLoader: async (fragmentId: string) => {
          const row = db.select().from(fragments).where(eq(fragments.id, fragmentId)).get()
          if (!row) return null
          return {
            nodes: JSON.parse(row.nodesJson),
            edges: JSON.parse(row.edgesJson),
            inputs: JSON.parse(row.inputsJson),
            outputs: JSON.parse(row.outputsJson),
          }
        },
      }

      const result = await this.engine.execute(this.config.workflow, ctx, (level, msg) => {
        this.sendLog(level, msg)
      })

      // 保存 session 变量
      this.sessionVars = this.extractSessionVars(result.variables)

      // 日志
      if (result.success === true) {
        this.sendLog('info', `#${runNum} 成功 (${result.stepsExecuted} steps)`)
      } else if (result.success === false) {
        this.sendLog('error', `#${runNum} 失败: ${result.error}`)
      } else {
        this.sendLog('info', `#${runNum} 完成 (${result.stepsExecuted} steps)`)
      }

      // 广播可视化结果（有注解时才发）
      if (ctx.annotations.length > 0) {
        this.emitVisual(event, ctx.annotations, runNum)
      }

      // 计数 + 检查上限
      this.processResult(result)
    } catch (err) {
      this.sendLog('error', `#${runNum} crashed: ${String(err)}`)
      this.flowState = 'fail'
      this.failCount++
      this.emitFlowState()
    } finally {
      this.busy = false
      // 定时模式：执行完毕后自动 pending，确保下次截图能继续跑
      this.autoPending()
    }
  }

  /** 处理执行结果：计数 + 检查上限 + 状态流转 */
  private processResult(result: ExecutionResult): void {
    // 计数：仅 endSuccess (true) 和 endFail (false) 参与
    if (result.success === true) {
      this.successCount++
      this.flowState = 'success'
    } else if (result.success === false) {
      this.failCount++
      this.flowState = 'fail'
    } else {
      // undefined = 中性结束，不计入
      this.flowState = 'idle'
    }
    this.emitFlowState()

    const { maxSuccessCount, maxFailCount, triggerMode } = this.config.runConfig

    // 成功上限
    if (maxSuccessCount > 0 && this.successCount >= maxSuccessCount) {
      this.sendLog('info', `✓ 成功 ${this.successCount} 次，达到上限 ${maxSuccessCount}，${triggerMode === 'scheduled' ? '回到等待定时' : '自动停止'}`)
      if (triggerMode === 'scheduled') {
        this.flowState = 'inactive'
        this.cancelled = false
      } else {
        this.flowState = 'completed'
        this.cancelled = true
      }
      this.emitFlowState()
      return
    }

    // 失败上限
    if (maxFailCount > 0 && this.failCount >= maxFailCount) {
      this.sendLog('error', `✗ 失败 ${this.failCount} 次，达到上限 ${maxFailCount}，${triggerMode === 'scheduled' ? '回到等待定时' : '自动停止'}`)
      if (triggerMode === 'scheduled') {
        this.flowState = 'inactive'
        this.cancelled = false
      } else {
        this.flowState = 'completed'
        this.cancelled = true
      }
      this.emitFlowState()
      return
    }

    // 未达标：定时模式回到 pending 等待下次截图；立即模式回到 idle
    // （此时 flowState 必为 success/fail/idle 之一，直接覆盖即可）
    if (triggerMode === 'scheduled') {
      this.flowState = 'pending'
      this.emitFlowState()
    } else {
      this.flowState = 'idle'
      this.emitFlowState()
    }
  }

  /** 是否需要截图（供 WorkflowService.syncDispatcher 决策） */
  needsScreenshot(): boolean {
    if (this.cancelled) return false
    // 立即模式：始终需要截图（每次都执行）
    if (this.config.runConfig.triggerMode !== 'scheduled') return true
    // 定时模式：仅 pending/processing（已唤醒、活跃执行）需要截图
    return this.flowState === 'pending' || this.flowState === 'processing'
  }

  /** 定时模式下，执行完毕后自动进入 pending 等待下次截图 */
  private autoPending(): void {
    if (this.cancelled) return
    if (this.config.runConfig.triggerMode !== 'scheduled') return
    if (this.flowState === 'completed' || this.flowState === 'inactive') return
    if (this.flowState !== 'pending') {
      this.flowState = 'pending'
      this.sendLog('info', `等待下次截图继续执行`)
      this.emitFlowState()
    }
  }

  /** 初始化变量：local 重置，session 保留 */
  private initVariables(): Record<string, unknown> {
    // session 变量预填充上次值，供 add/sub/createOrSet 等操作读取
    const vars: Record<string, unknown> = { ...this.sessionVars }
    const inputValues = this.config.runConfig.inputValues ?? {}

    for (const node of this.config.workflow.nodes) {
      if (node.type !== 'variable') continue
      const { name, scope, value } = node.config as Record<string, unknown>
      const varName = String(name ?? '')
      if (!varName) continue

      if (scope === 'session') {
        // session 变量：已有上次值则保留，否则用默认值初始化
        if (!(varName in vars)) {
          vars[varName] = value !== undefined && value !== '' ? value : 0
        }
      } else if (scope === 'input') {
        // input 变量：优先使用外部输入值，否则用默认值
        if (varName in inputValues) {
          vars[varName] = inputValues[varName]
        } else {
          vars[varName] = value !== undefined && value !== '' ? value : 0
        }
      } else {
        // local 变量：每次重置为默认值
        vars[varName] = value !== undefined && value !== '' ? value : 0
      }
    }

    return vars
  }

  /** 从执行结果中提取 session 变量 */
  private extractSessionVars(vars: Record<string, unknown>): Record<string, unknown> {
    const session: Record<string, unknown> = {}
    for (const node of this.config.workflow.nodes) {
      if (node.type !== 'variable') continue
      const { name, scope } = node.config as Record<string, unknown>
      const varName = String(name ?? '')
      if (!varName) continue

      if (scope === 'session' && varName in vars) {
        session[varName] = vars[varName]
      }
    }
    return session
  }

  /** 广播工作流状态（兼容旧接口） */
  private emitStatus(state: string): void {
    eventBus.emit(EventBusEvent.WORKFLOW_STATE, {
      runId: this.config.runId,
      workflowId: this.config.workflow.id,
      deviceId: this.config.deviceId,
      state,
      executionCount: this.executionCount,
      flowState: this.flowState,
      successCount: this.successCount,
      failCount: this.failCount,
    })
  }

  /** 广播 flow 执行状态变更 */
  private emitFlowState(): void {
    const state = this.flowState === 'completed' ? 'stopped'
      : this.flowState === 'fail' ? 'error'
      : this.flowState === 'inactive' ? 'idle'
      : 'running'
    eventBus.emit(EventBusEvent.WORKFLOW_STATE, {
      runId: this.config.runId,
      workflowId: this.config.workflow.id,
      deviceId: this.config.deviceId,
      state,
      executionCount: this.executionCount,
      flowState: this.flowState,
      successCount: this.successCount,
      failCount: this.failCount,
    })
  }

  /** 广播可视化结果 */
  private emitVisual(screenshot: ScreenshotEvent, rawAnnotations: import('./engine.js').RawAnnotation[], runNum: number): void {
    const annotations: VisualAnnotation[] = rawAnnotations.map((a) => ({
      ...a,
      workflowId: this.config.workflow.id,
      workflowName: this.config.workflow.name,
    }))
    eventBus.emit(EventBusEvent.WORKFLOW_VISUAL, {
      deviceId: this.config.deviceId,
      screenshot: screenshot.image,
      screenshotWidth: screenshot.width,
      screenshotHeight: screenshot.height,
      originalWidth: screenshot.originalWidth,
      originalHeight: screenshot.originalHeight,
      annotations,
      executionCount: runNum,
      timestamp: Date.now(),
    })
  }
}
