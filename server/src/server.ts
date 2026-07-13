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

  // ── sidecar 模式（桌面版）：父进程关闭 stdin 即触发优雅退出 ──
  if (process.env.AUTOMAN_SIDECAR === '1') {
    let closing = false
    const shutdown = (): void => {
      if (closing) return
      closing = true
      // 看门狗：app.close() 卡住时 4s 后强制退出（父进程另有 taskkill 兜底）
      setTimeout(() => process.exit(1), 4000).unref()
      void app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      )
    }
    process.stdin.resume()
    process.stdin.on('end', shutdown)
    process.stdin.on('close', shutdown)
    process.stdin.on('error', shutdown)
  }
}

void main()
