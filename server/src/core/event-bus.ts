// ─────────────────────────────────────────────
// EventBus 事件总线
// 系统内部解耦通信的核心组件
// Actor → EventBus → WS Gateway → 前端
// ─────────────────────────────────────────────

import { EventEmitter } from 'node:events'

/** EventBus 事件类型枚举 */
export enum EventBusEvent {
  /** Actor 日志输出 */
  ACTOR_LOG = 'actor:log',
  /** Actor 状态变更 */
  ACTOR_STATE_CHANGE = 'actor:state-change',
  /** 任务创建 */
  TASK_CREATED = 'task:created',
  /** 任务完成 */
  TASK_COMPLETED = 'task:completed',
  /** 任务失败 */
  TASK_FAILED = 'task:failed',
  /** 任务停止 */
  TASK_STOPPED = 'task:stopped',
  /** 系统错误 */
  SYSTEM_ERROR = 'system:error',
}

/** Actor 日志事件数据结构 */
export interface ActorLogEvent {
  actorId: string
  level: string
  module: string
  message: string
  timestamp: number
}

/** Actor 状态变更事件数据结构 */
export interface ActorStateEvent {
  actorId: string
  from: string
  to: string
  timestamp: number
}

/**
 * EventBus 单例
 * 所有模块通过此实例进行事件发布 / 订阅
 *
 * @example
 * ```ts
 * eventBus.emit(EventBusEvent.ACTOR_LOG, { actorId, level: 'info', message: '...' })
 * eventBus.on(EventBusEvent.ACTOR_LOG, (data) => { ... })
 * ```
 */
class EventBus extends EventEmitter {
  constructor() {
    super()
    // 提高最大监听器数量，避免生产环境警告
    this.setMaxListeners(100)
  }
}

export const eventBus = new EventBus()
