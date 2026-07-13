// ─────────────────────────────────────────────
// smoke-server — sidecar 产物独立冒烟（不依赖 Electron）
//
// 用当前 Node 直跑 out/server/index.mjs，验证：
//   1. /health 可达且带应用指纹
//   2. 静态托管（web/dist → /）
//   3. 空数据目录首启迁移
//   4. stdin 关闭触发优雅退出（sidecar 模式）
// ─────────────────────────────────────────────

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const OUT_DIR = resolve(__dirname, '..', 'out', 'server')
const PORT = 3911

const dataDir = mkdtempSync(join(tmpdir(), 'automan-smoke-'))
console.log(`[smoke] data dir: ${dataDir}`)

const child = spawn(process.execPath, [join(OUT_DIR, 'index.mjs')], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    AUTOMAN_SIDECAR: '1',
    HOST: '127.0.0.1',
    PORT: String(PORT),
    AUTOMAN_DATA_DIR: dataDir,
    AUTOMAN_WEB_DIST: join(REPO_ROOT, 'web', 'dist'),
    AUTOMAN_MIGRATIONS_DIR: join(OUT_DIR, 'drizzle'),
    AUTOMAN_CONFIG_PATH: join(OUT_DIR, 'automan.config.json5'),
  },
  stdio: ['pipe', 'inherit', 'inherit'],
  cwd: OUT_DIR,
})

const fail = (msg) => {
  console.error(`[smoke] FAIL: ${msg}`)
  child.kill('SIGKILL')
  process.exit(1)
}

async function waitHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`)
      if (res.ok) return res.json()
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  fail('/health 10s 内未就绪')
}

const health = await waitHealth()
if (health.app !== 'automan' || !health.fingerprint)
  fail(`/health 缺指纹: ${JSON.stringify(health)}`)
console.log(`[smoke] /health OK, fingerprint=${health.fingerprint}`)

const index = await fetch(`http://127.0.0.1:${PORT}/`)
const indexText = await index.text()
if (!index.ok || !indexText.includes('<div id="app">')) fail('静态托管 index.html 异常')
console.log('[smoke] 静态托管 OK')

if (!existsSync(join(dataDir, 'automan.db'))) fail('数据库未在指定数据目录创建')
console.log('[smoke] 首启迁移 OK（automan.db 已创建）')

// 关 stdin → 优雅退出
const exitCode = await new Promise((resolveExit) => {
  const timer = setTimeout(() => resolveExit('timeout'), 8000)
  child.on('exit', (code) => {
    clearTimeout(timer)
    resolveExit(code)
  })
  child.stdin.end()
})
if (exitCode !== 0) fail(`优雅退出异常: exit=${exitCode}`)
console.log('[smoke] stdin 关闭 → 优雅退出 OK (exit 0)')

rmSync(dataDir, { recursive: true, force: true })
console.log('[smoke] ALL PASS')
