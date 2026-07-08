// ─────────────────────────────────────────────
// Actor 基类
// 所有 Actor 的公共抽象，定义生命周期和通信接口
// ─────────────────────────────────────────────

import { ActorState } from '@automan/shared/types.js'
import { eventBus, EventBusEvent } from '../../core/event-bus.js'
import { logger } from '../../core/logger.js'

export abstract class ActorBase {
  protected state: ActorState = ActorState.IDLE

  constructor(
    public readonly id: string,
    protected readonly module: string = 'Actor',
  ) {}

  /** 启动 Actor */
  async start(): Promise<void> {
    const prev = this.state
    this.state = ActorState.RUNNING
    this.emitStateChange(prev)
    logger.info(this.module, `actor ${this.id} started`)
  }

  /** 停止 Actor */
  async stop(): Promise<void> {
    const prev = this.state
    this.state = ActorState.STOPPED
    this.emitStateChange(prev)
    logger.info(this.module, `actor ${this.id} stopped`)
  }

  /** 接收外部消息 */
  abstract receive(msg: unknown): Promise<void>

  /** 获取当前状态 */
  getState(): ActorState {
    return this.state
  }

  /** 是否正在运行 */
  isRunning(): boolean {
    return this.state === ActorState.RUNNING
  }

  /** 通过 EventBus 发送 Actor 日志 */
  protected sendLog(level: string, message: string): void {
    eventBus.emit(EventBusEvent.ACTOR_LOG, {
      actorId: this.id,
      level,
      module: this.module,
      message,
      timestamp: Date.now(),
    })
  }

  /** 通过 EventBus 发送状态变更事件 */
  private emitStateChange(from: ActorState): void {
    eventBus.emit(EventBusEvent.ACTOR_STATE_CHANGE, {
      actorId: this.id,
      from,
      to: this.state,
      timestamp: Date.now(),
    })
  }
}
