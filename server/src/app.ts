// ─────────────────────────────────────────────
// Fastify 应用工厂
// 负责：注册插件、初始化服务、挂载路由模块
// 路由逻辑已拆分到 routes/ 目录，此文件只做编排
// ─────────────────────────────────────────────

import Fastify from 'fastify'
import type { FastifyInstance, FastifyError } from 'fastify'

// 插件
import cors from '@fastify/cors'
import wsPlugin from './plugins/ws.js'
import loggerPlugin from './plugins/logger.js'

// 服务层
import { ActorManager } from './modules/actor/actor.manager.js'
import { TaskService } from './modules/task/task.service.js'
import { WsMessageType } from '@automan/shared/types.js'

// 数据库
import { sqlite } from './db/index.js'
import { runMigrations } from './db/migrate.js'

// 路由模块
import { deviceRoutes } from './routes/device.routes.js'
import { taskRoutes } from './routes/task.routes.js'
import { filesystemRoutes } from './routes/filesystem.routes.js'

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // ── 1. 全局错误处理 ────────────────────────
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = err.statusCode ?? 500
    const code = err.code ?? 'INTERNAL_ERROR'
    // 4xx 客户端错误返回原始 message；5xx 隐藏内部细节
    const message = statusCode < 500 ? err.message : 'Internal Server Error'

    app.log.error({ err, url: request.url, method: request.method }, err.message)
    reply.status(statusCode).send({ statusCode, code, message })
  })

  // ── 2. 注册插件 ────────────────────────────
  await app.register(cors, { origin: true })
  await app.register(loggerPlugin)
  await app.register(wsPlugin)

  // ── 3. 初始化数据库 ────────────────────────
  runMigrations()
  app.log.info('Database initialized and migrations applied')

  // ── 4. 初始化服务层 ────────────────────────
  const actorManager = new ActorManager()
  const taskService = new TaskService(actorManager)

  // 将服务层注入 Dispatcher（延迟绑定）
  app.wsDispatcher.setServices(actorManager, taskService)

  // ── 4. EventBus 监听 → 广播到 WS 客户端 ──
  const { eventBus, EventBusEvent } = await import('./core/event-bus.js')

  eventBus.on(EventBusEvent.ACTOR_LOG, (data) => {
    app.wsGateway.broadcast({
      type: WsMessageType.ACTOR_LOG,
      payload: data,
      timestamp: Date.now(),
    })
  })

  eventBus.on(EventBusEvent.ACTOR_STATE_CHANGE, (data) => {
    app.wsGateway.broadcast({
      type: WsMessageType.ACTOR_STATE,
      payload: data,
      timestamp: Date.now(),
    })
  })

  // ── 5. 基础路由 ────────────────────────────
  app.get('/', async () => {
    return { message: 'Hello World — Automan Server is running 🚀' }
  })

  app.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      actors: actorManager.getActorCount(),
      wsClients: app.wsGateway.getConnectionCount(),
      timestamp: Date.now(),
    }
  })

  // ── 6. 业务路由模块 ────────────────────────
  await taskRoutes(app, taskService)
  await deviceRoutes(app)
  await filesystemRoutes(app)

  // ── 7. WebSocket 路由 ──────────────────────
  app.get('/ws', { websocket: true }, (socket, req) => {
    const clientId = crypto.randomUUID()

    app.wsGateway.addClient(clientId, socket as unknown as import('ws').WebSocket)

    app.wsGateway.send(clientId, {
      type: WsMessageType.CONNECTED,
      payload: { clientId, serverTime: Date.now() },
      timestamp: Date.now(),
    })

    socket.on('message', (data: Buffer) => {
      void app.wsGateway.handleMessage(clientId, data.toString())
    })

    socket.on('close', () => {
      app.wsGateway.removeClient(clientId)
    })

    socket.on('error', (err: Error) => {
      app.log.error({ clientId, err }, 'WebSocket error')
      app.wsGateway.removeClient(clientId)
    })
  })

  // ── 8. 优雅关闭 ────────────────────────────
  app.addHook('onClose', async () => {
    app.log.info('Shutting down — destroying all actors...')
    await actorManager.destroyAll()
    sqlite.close()
    app.log.info('Database connection closed')
  })

  return app
}
