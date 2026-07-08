import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * 日志插件
 * 将自定义 logger 实例挂载到 Fastify，路由内通过 app.log 使用
 * 注意：Fastify 内置 pino，此处通过 logger 选项注入自定义配置
 */
async function loggerPlugin(app: FastifyInstance): Promise<void> {
  // Fastify 已内置 pino logger，可通过 app.log 直接使用
  // 如需自定义格式 / 传输，可在 createApp 时通过 logger 选项传入
  app.log.info('[Logger] plugin registered')
}

export default fp(loggerPlugin, {
  name: 'logger-plugin',
})
