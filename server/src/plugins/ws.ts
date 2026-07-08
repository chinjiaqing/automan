// ─────────────────────────────────────────────
// WebSocket 插件
// 注册 @fastify/websocket，初始化 Gateway + Dispatcher
// 挂载到 Fastify 实例供路由层调用
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'
import { WsGateway } from '../modules/ws/ws.gateway.js'
import { WsDispatcher } from '../modules/ws/ws.dispatcher.js'

declare module 'fastify' {
  interface FastifyInstance {
    wsGateway: WsGateway
    wsDispatcher: WsDispatcher
  }
}

async function wsPlugin(app: FastifyInstance): Promise<void> {
  // 注册 @fastify/websocket
  await app.register(websocket)

  // 初始化 Gateway 和 Dispatcher，互相注入依赖
  const gateway = new WsGateway()
  const dispatcher = new WsDispatcher(gateway)

  gateway.setDispatcher(dispatcher)

  // 挂载到 Fastify 实例
  app.decorate('wsGateway', gateway)
  app.decorate('wsDispatcher', dispatcher)

  app.log.info('[WS] plugin registered — gateway & dispatcher ready')
}

export default fp(wsPlugin, {
  name: 'ws-plugin',
})
