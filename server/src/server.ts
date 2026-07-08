// ─────────────────────────────────────────────
// 服务启动入口
// ─────────────────────────────────────────────

import { createApp } from './app.js'

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = Number(process.env.PORT ?? 3000)

async function main(): Promise<void> {
  const app = await createApp()

  try {
    await app.listen({ host: HOST, port: PORT })
    console.log(`\n🚀 Automan Server running at http://${HOST}:${PORT}`)
    console.log(`📡 WebSocket endpoint:     ws://${HOST}:${PORT}/ws`)
    console.log(`❤️  Health check:          http://${HOST}:${PORT}/health\n`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void main()
