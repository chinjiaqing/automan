// ─────────────────────────────────────────────
// prune-modules — 物化 server 的原生依赖到 out/server/node_modules
//
// bundle（index.mjs）已内联全部纯 JS 依赖，node_modules 只为
// external 的原生模块（better-sqlite3 / sharp）及其传递依赖存在。
// 用 pnpm deploy 物化（真实文件、无 symlink），v1 保留全量 prod
// 依赖以换取「绝不漏拷传递依赖」的确定性（体积 ~40-60MB，可接受）。
//
// 注意：deploy 产物的原生二进制与「执行本脚本的平台 + Node ABI」绑定，
// Windows 产物必须在 Windows 上跑本脚本（mac 同理）。
// ─────────────────────────────────────────────

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const OUT_DIR = resolve(__dirname, '..', 'out', 'server')
const DEPLOY_DIR = resolve(__dirname, '..', 'out', '.deploy-tmp')

function runDeploy(extraArgs) {
  // 每次执行前清空目标目录（失败的 deploy 会留下残留，触发 DEPLOY_DIR_NOT_EMPTY）
  rmSync(DEPLOY_DIR, { recursive: true, force: true })
  // node-linker=hoisted：产出 npm 风格扁平真实目录（无 .pnpm symlink 布局），
  // 打包产物可直接被 Node ESM/CJS 解析，且 electron-builder/NSIS 复制无 symlink 坑
  const args = [
    '--filter',
    '@automan/server',
    'deploy',
    '--prod',
    '--config.node-linker=hoisted',
    ...extraArgs,
    DEPLOY_DIR,
  ]
  console.log(`[prune-modules] pnpm ${args.join(' ')}`)
  return spawnSync('pnpm', args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

// pnpm v10+ 的 deploy 默认要求 injected workspace 配置，--legacy 回退 v9 语义（解引用拷贝）
let result = runDeploy([])
if (result.status !== 0) {
  console.log('[prune-modules] deploy failed, retrying with --legacy ...')
  result = runDeploy(['--legacy'])
}
if (result.status !== 0) {
  console.error('[prune-modules] pnpm deploy failed')
  process.exit(1)
}

const deployedModules = join(DEPLOY_DIR, 'node_modules')
if (!existsSync(deployedModules)) {
  console.error(`[prune-modules] node_modules not found in deploy output: ${deployedModules}`)
  process.exit(1)
}

const target = join(OUT_DIR, 'node_modules')
rmSync(target, { recursive: true, force: true })
// 排除运行时无用条目：.bin（CLI 链接）、.pnpm/.modules.yaml（pnpm 元数据）、
// @automan（workspace 源码链接，bundle 已内联 shared）
const TOP_LEVEL_EXCLUDES = new Set(['.bin', '.pnpm', '.modules.yaml', '@automan'])
cpSync(deployedModules, target, {
  recursive: true,
  filter: (src) => {
    const rel = src.slice(deployedModules.length).replace(/^[/\\]/, '')
    const top = rel.split(/[/\\]/)[0]
    return !TOP_LEVEL_EXCLUDES.has(top)
  },
})
rmSync(DEPLOY_DIR, { recursive: true, force: true })

console.log(`[prune-modules] done → ${target}`)
