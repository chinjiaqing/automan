// ─────────────────────────────────────────────
// WorkflowActor — 工作流运行 Actor
// 职责：订阅截图事件 → 调用引擎执行 → busy 锁防并发
// ─────────────────────────────────────────────

import { ActorBase } from '../actor/actor.base.js'
import type { Workflow } from '@automan/shared/types.js'
import { WorkflowEngine, type EngineContext } from './engine.js'
import { eventBus, EventBusEvent } from '../../core/event-bus.js'
import type { ScreenshotEvent } from './screenshot.dispatcher.js'
import type { VisualAnnotation } from '@automan/shared/types.js'
import type { DeviceSession } from './device.session.js'
import { AdbService } from '../device/adb.service.js'

/** WorkflowActor 配置 */
export interface WorkflowActorConfig {
  runId: string
  workflow: Workflow
  deviceId: string
  ldconsolePath: string
  instanceIndex: number
  session: DeviceSession
}

export class WorkflowActor extends ActorBase {
  private readonly config: WorkflowActorConfig
  private readonly engine = new WorkflowEngine()
  private busy = false
  private cancelled = false
  private deviceReady = false
  private sessionVars: Record<string, unknown> = {}
  private executionCount = 0

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

  async receive(msg: unknown): Promise<void> {
    this.sendLog('debug', `received: ${JSON.stringify(msg)}`)
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
    }
  }

  // ── 私有方法 ─────────────────────────────────

  /** 收到截图 → 执行工作流 */
  private async onScreenshot(event: ScreenshotEvent): Promise<void> {
    if (!this.isRunning()) return
    if (this.busy) {
      this.sendLog('debug', `busy, skip screenshot handle #${this.executionCount + 1}`)
      return
    }

    // ★ busy 锁必须在 ensureReady 之前设置！
    // 否则多个截图事件会在 await 期间全部通过 busy 检查，导致排队执行
    this.busy = true
    this.executionCount++
    const runNum = this.executionCount

    try {
      // 等待设备就绪（仅首次有效，幂等）
      if (!this.deviceReady) {
        try {
          await this.config.session.ensureReady()
          this.deviceReady = true
        } catch (err) {
          this.sendLog('error', `设备就绪检测失败: ${err instanceof Error ? err.message : String(err)}，本次任务已停止`)
          this.cancelled = true
          this.emitStatus('error')
          return
        }
      }

      this.sendLog('info', `#${runNum} executing...`)

      // 初始化 local 变量（每次重置），session 变量保留
      const variables = this.initVariables()

      const adbService = new AdbService()
      const ctx: EngineContext = {
        outputs: {},
        variables,
        screenshot: event.image,
        deviceId: this.config.deviceId,
        adbPath: adbService.resolveAdbPath(this.config.ldconsolePath),
        adbTarget: adbService.getTarget(this.config.instanceIndex),
        annotations: [],
        screenshotWidth: event.width,
        screenshotHeight: event.height,
        originalWidth: event.originalWidth,
        originalHeight: event.originalHeight,
        shouldCancel: () => this.cancelled,
      }

      const result = await this.engine.execute(this.config.workflow, ctx, (level, msg) => {
        this.sendLog(level, msg)
      })

      // 保存 session 变量
      this.sessionVars = this.extractSessionVars(result.variables)

      if (result.success) {
        this.sendLog('info', `#${runNum} completed (${result.stepsExecuted} steps)`)
      } else {
        this.sendLog('error', `#${runNum} failed: ${result.error}`)
      }

      // 广播可视化结果（有注解时才发）
      if (ctx.annotations.length > 0) {
        this.emitVisual(event, ctx.annotations, runNum)
      }

      // 广播状态变更
      this.emitStatus(result.success ? 'idle' : 'error')
    } catch (err) {
      this.sendLog('error', `#${runNum} crashed: ${String(err)}`)
      this.emitStatus('error')
    } finally {
      this.busy = false
    }
  }

  /** 初始化变量：local 重置，session 保留 */
  private initVariables(): Record<string, unknown> {
    const vars: Record<string, unknown> = { ...this.sessionVars }

    for (const node of this.config.workflow.nodes) {
      if (node.type !== 'variable') continue
      const { name, scope, value } = node.config as Record<string, unknown>
      const varName = String(name ?? '')
      if (!varName) continue

      if (scope === 'session') {
        // session 变量保持上次值（已在 sessionVars 中）
        if (!(varName in vars)) {
          vars[varName] = value !== undefined ? Number(value) || 0 : 0
        }
      } else {
        // local / input 变量重置
        vars[varName] = value !== undefined ? Number(value) || 0 : 0
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

  /** 广播工作流状态 */
  private emitStatus(state: string): void {
    eventBus.emit(EventBusEvent.WORKFLOW_STATE, {
      runId: this.config.runId,
      workflowId: this.config.workflow.id,
      deviceId: this.config.deviceId,
      state,
      executionCount: this.executionCount,
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
