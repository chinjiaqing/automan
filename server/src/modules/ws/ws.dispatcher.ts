// ─────────────────────────────────────────────
// WsDispatcher — 消息分发层
// 职责：根据消息类型路由到对应业务处理器
// 不包含连接管理逻辑
// ─────────────────────────────────────────────

import type { WsGateway } from './ws.gateway.js'
import type { WsMessage, TaskStartPayload, TaskStopPayload } from '@automan/shared/types.js'
import { WsMessageType } from '@automan/shared/types.js'
import { logger } from '../../core/logger.js'
import type { ActorManager } from '../actor/actor.manager.js'
import type { TaskService } from '../task/task.service.js'

export class WsDispatcher {
  private actorManager?: ActorManager
  private taskService?: TaskService

  constructor(private readonly gateway: WsGateway) {}

  /**
   * 注入业务服务（由 app.ts 在服务层初始化后调用）
   * 合并为一次调用，替代原先分散的 setActorManager / setTaskService
   */
  setServices(actorManager: ActorManager, taskService: TaskService): void {
    this.actorManager = actorManager
    this.taskService = taskService
  }

  /**
   * 核心分发逻辑
   * 根据消息 type 路由到对应处理器
   */
  async dispatch(clientId: string, message: WsMessage): Promise<void> {
    logger.debug('WsDispatcher', `received [${message.type}] from ${clientId}`)

    switch (message.type) {
      case WsMessageType.PING:
        this.handlePing(clientId)
        break

      case WsMessageType.TASK_START:
        await this.handleTaskStart(clientId, message.payload as TaskStartPayload)
        break

      case WsMessageType.TASK_STOP:
        await this.handleTaskStop(clientId, message.payload as TaskStopPayload)
        break

      case WsMessageType.TASK_LIST:
        await this.handleTaskList(clientId)
        break

      case WsMessageType.ACTOR_SEND:
        await this.handleActorSend(clientId, message.payload as Record<string, unknown>)
        break

      default:
        logger.warn('WsDispatcher', `unknown message type: ${message.type}`)
        this.sendError(clientId, 'UNKNOWN_TYPE', `unknown message type: ${message.type}`)
    }
  }

  // ── 私有处理器 ─────────────────────────────

  private handlePing(clientId: string): void {
    this.gateway.send(clientId, {
      type: WsMessageType.PONG,
      timestamp: Date.now(),
    })
  }

  private async handleTaskStart(clientId: string, payload: TaskStartPayload): Promise<void> {
    const services = this.requireServices(clientId)
    if (!services) return
    try {
      const task = await services.taskService.createTask({
        taskId: payload.taskId ?? crypto.randomUUID(),
        taskType: payload.taskType,
        deviceId: payload.deviceId,
        params: payload.params,
      })
      this.gateway.send(clientId, {
        type: WsMessageType.TASK_STATUS,
        payload: { taskId: task.taskId, state: task.state, actorId: task.actorId },
        timestamp: Date.now(),
      })
    } catch (err) {
      this.sendError(clientId, 'TASK_START_FAILED', String(err))
    }
  }

  private async handleTaskStop(clientId: string, payload: TaskStopPayload): Promise<void> {
    const services = this.requireServices(clientId)
    if (!services) return
    const actor = services.actorManager.getActor(payload.taskId)
    if (actor) {
      await actor.stop()
      this.gateway.send(clientId, {
        type: WsMessageType.TASK_STATUS,
        payload: { taskId: payload.taskId, state: 'stopped', actorId: actor.id },
        timestamp: Date.now(),
      })
    } else {
      this.sendError(clientId, 'ACTOR_NOT_FOUND', `actor ${payload.taskId} not found`)
    }
  }

  private async handleTaskList(clientId: string): Promise<void> {
    const services = this.requireServices(clientId)
    if (!services) return
    const tasks = services.taskService.listTasks()
    this.gateway.send(clientId, {
      type: WsMessageType.TASK_LIST,
      payload: { tasks },
      timestamp: Date.now(),
    })
  }

  private async handleActorSend(
    clientId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const services = this.requireServices(clientId)
    if (!services) return
    const actorId = payload.actorId as string
    const actor = services.actorManager.getActor(actorId)
    if (actor) {
      await actor.receive(payload)
    } else {
      this.sendError(clientId, 'ACTOR_NOT_FOUND', `actor ${actorId} not found`)
    }
  }

  // ── 辅助方法 ───────────────────────────────

  /** 确保服务已注入，未注入时向客户端返回错误 */
  private requireServices(clientId: string): { actorManager: ActorManager; taskService: TaskService } | null {
    if (!this.actorManager || !this.taskService) {
      this.sendError(clientId, 'SERVICE_UNAVAILABLE', 'Services not initialized')
      return null
    }
    return { actorManager: this.actorManager, taskService: this.taskService }
  }

  /** 向客户端发送错误消息 */
  private sendError(clientId: string, code: string, message: string): void {
    this.gateway.send(clientId, {
      type: WsMessageType.ERROR,
      payload: { code, message },
      timestamp: Date.now(),
    })
  }
}
