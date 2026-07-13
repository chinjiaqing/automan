// ─────────────────────────────────────────────
// build-server — 把 @automan/server 打包为 sidecar 产物
//
// 产出布局（out/server/，自包含）：
//   index.mjs            esbuild bundle（TS → 单文件 ESM）
//   index.mjs.map        sourcemap（生产排障）
//   *.py                 Python 脚本（python-helper 的 LIBS_DIR=__dirname 兼容）
//   drizzle/             SQL 迁移（运行时经 AUTOMAN_MIGRATIONS_DIR 注入）
//   automan.config.json5 应用配置（运行时经 AUTOMAN_CONFIG_PATH 注入）
//   node_modules/        原生依赖（由 prune-modules.mjs 填充）
//   bin/                 便携 Node 运行时（由 prepare-node.mjs 填充）
// ─────────────────────────────────────────────

import { build } from 'esbuild'
import { cpSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SERVER_DIR = join(REPO_ROOT, 'server')
const OUT_DIR = resolve(__dirname, '..', 'out', 'server')

// 清理旧 bundle（保留 node_modules/ 与 bin/，它们由其他脚本管理且体积大）
if (existsSync(OUT_DIR)) {
  for (const entry of readdirSync(OUT_DIR)) {
    if (entry === 'node_modules' || entry === 'bin') continue
    rmSync(join(OUT_DIR, entry), { recursive: true, force: true })
  }
}
mkdirSync(OUT_DIR, { recursive: true })

// ── esbuild bundle ───────────────────────────
// external 说明：
//   better-sqlite3 / sharp    原生模块，运行时从旁边 node_modules/ 加载
//   bufferutil / utf-8-validate  ws 的可选原生加速，缺失时走 JS fallback
await build({
  entryPoints: [join(SERVER_DIR, 'src', 'server.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(OUT_DIR, 'index.mjs'),
  sourcemap: true,
  // esbuild 对内联 CJS 依赖生成的 __require 需要真实 require 可用
  banner: {
    js: "import { createRequire } from 'node:module';const require = createRequire(import.meta.url);",
  },
  external: ['better-sqlite3', 'sharp', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
})

// ── 复制运行时资源 ───────────────────────────
const libsDir = join(SERVER_DIR, 'src', 'libs')
for (const file of readdirSync(libsDir)) {
  if (file.endsWith('.py')) {
    cpSync(join(libsDir, file), join(OUT_DIR, file))
  }
}
cpSync(join(SERVER_DIR, 'drizzle'), join(OUT_DIR, 'drizzle'), { recursive: true })
cpSync(join(SERVER_DIR, 'automan.config.json5'), join(OUT_DIR, 'automan.config.json5'))

console.log(`[build-server] done → ${OUT_DIR}`)
