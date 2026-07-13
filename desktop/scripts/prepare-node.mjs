// ─────────────────────────────────────────────
// prepare-node — 便携 Node 运行时 → out/server/bin/automan-server(.exe)
//
// 直接复制「当前执行本脚本的 Node 二进制」（process.execPath）：
// out/server/node_modules 里原生模块（better-sqlite3 等）的 prebuild
// 与 pnpm install 时的 Node ABI 绑定，sidecar 运行时必须同版本，
// 复制自身即天然对齐（CI 上由 setup-node 统一，本地由 nvm 统一）。
//
// 改名 automan-server：NSIS 升级/卸载可按镜像名 taskkill 而不误伤
// 用户其它 node 进程；防火墙弹窗也显示品牌名。
// ─────────────────────────────────────────────

import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BIN_DIR = resolve(__dirname, '..', 'out', 'server', 'bin')

const isWin = process.platform === 'win32'
const targetBin = join(BIN_DIR, isWin ? 'automan-server.exe' : 'automan-server')

mkdirSync(BIN_DIR, { recursive: true })
copyFileSync(process.execPath, targetBin)
if (!isWin) chmodSync(targetBin, 0o755)

console.log(
  `[prepare-node] done → ${targetBin} (node ${process.version}, ${process.platform}-${process.arch})`,
)
