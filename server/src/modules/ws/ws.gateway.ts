// ─────────────────────────────────────────────
// WsGateway — WebSocket 连接管理层
// 职责：管理客户端连接生命周期，接收消息并转交 Dispatcher
// 不包含任何业务逻辑
// ─────────────────────────────────────────────

import type { WebSocket } from 'ws'
import type { WsDispatcher } from './ws.dispatcher.js'
import type { WsMessage } from '@automan/shared/types.js'
import { logger } from '../../core/logger.js'

export class WsGateway {
  private connections = new Map<string, WebSocket>()
  private dispatcher!: WsDispatcher

  /** 注入 Dispatcher（由 ws.plugin.ts 在初始化时调用） */
  setDispatcher(dispatcher: WsDispatcher): void {
    this.dispatcher = dispatcher
  }

  /** 注册新连接 */
  addClient(clientId: string, socket: WebSocket): void {
    this.connections.set(clientId, socket)
    logger.info('WsGateway', `client connected: ${clientId} (total: ${this.connections.size})`)
  }

  /** 移除连接 */
  removeClient(clientId: string): void {
    this.connections.delete(clientId)
    logger.info('WsGateway', `client disconnected: ${clientId} (total: ${this.connections.size})`)
  }

  /** 向指定客户端发送消息 */
  send(clientId: string, message: WsMessage): void {
    const socket = this.connections.get(clientId)
    if (!socket || socket.readyState !== 1 /* OPEN */) return
    socket.send(JSON.stringify(message))
  }

  /** 广播消息给所有已连接客户端 */
  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message)
    for (const socket of this.connections.values()) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(data)
      }
    }
  }

  /** 处理客户端发来的消息（由路由层调用） */
  async handleMessage(clientId: string, raw: string): Promise<void> {
    try {
      const message = JSON.parse(raw) as WsMessage
      await this.dispatcher.dispatch(clientId, message)
    } catch (err) {
      logger.error('WsGateway', `invalid message from ${clientId}`, err)
      this.send(clientId, {
        type: 'error',
        payload: { code: 'INVALID_MESSAGE', message: 'JSON parse failed' },
        timestamp: Date.now(),
      })
    }
  }

  /** 获取当前连接数 */
  getConnectionCount(): number {
    return this.connections.size
  }

  /** 获取所有客户端 ID 列表 */
  getClientIds(): string[] {
    return [...this.connections.keys()]
  }
}
