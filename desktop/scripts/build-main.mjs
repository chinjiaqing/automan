// ─────────────────────────────────────────────
// build-main — Electron 主进程打包
// esbuild src/main.ts → dist/main.cjs（CJS，electron external）
// + 复制 assets/（loading.html、托盘图标）→ dist/assets/
// ─────────────────────────────────────────────

import { build } from 'esbuild'
import { cpSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESKTOP_DIR = resolve(__dirname, '..')
const DIST_DIR = join(DESKTOP_DIR, 'dist')

rmSync(DIST_DIR, { recursive: true, force: true })

await build({
  entryPoints: [join(DESKTOP_DIR, 'src', 'main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: join(DIST_DIR, 'main.cjs'),
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
})

cpSync(join(DESKTOP_DIR, 'assets'), join(DIST_DIR, 'assets'), { recursive: true })

console.log(`[build-main] done → ${DIST_DIR}`)
