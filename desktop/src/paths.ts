// ─────────────────────────────────────────────
// paths — 桌面端路径映射
// 打包态：资源在 process.resourcesPath（extraResources 布局）
// 开发态：资源在 desktop/out/（build-server 等脚本的产物）
// ─────────────────────────────────────────────

import { app } from 'electron'
import { join, resolve } from 'node:path'

/** desktop 包根目录（开发态 = <repo>/desktop，打包态 = app.asar） */
const APP_ROOT = app.getAppPath()

/** 资源根：打包态 resources/，开发态 desktop/out/ */
const RES_ROOT = app.isPackaged ? process.resourcesPath : join(APP_ROOT, 'out')

/** sidecar server 产物目录（index.mjs / *.py / drizzle / node_modules / bin） */
export const SERVER_DIR = join(RES_ROOT, 'server')

/** sidecar 入口 bundle */
export const SERVER_ENTRY = join(SERVER_DIR, 'index.mjs')

/** 便携 Node 运行时（品牌化命名，便于 taskkill 与防火墙识别） */
export const NODE_BIN = join(
  SERVER_DIR,
  'bin',
  process.platform === 'win32' ? 'automan-server.exe' : 'automan-server',
)

/** web 前端静态资源目录 */
export const WEB_DIST = app.isPackaged
  ? join(RES_ROOT, 'web')
  : resolve(APP_ROOT, '..', 'web', 'dist')

/** drizzle 迁移目录 */
export const MIGRATIONS_DIR = join(SERVER_DIR, 'drizzle')

/** 应用配置文件 */
export const CONFIG_PATH = join(SERVER_DIR, 'automan.config.json5')

/** Windows 内置 Python（mac 版不打包，路径不存在时 server 端自动回退） */
export const PYTHON_PATH = join(RES_ROOT, 'python', 'python.exe')

/** 用户数据目录（DB 等运行时可写数据） */
export const DATA_DIR = resolve(join(app.getPath('userData'), 'data'))

/** sidecar 日志目录 */
export const LOGS_DIR = join(app.getPath('userData'), 'logs')

/** 主进程静态资源（loading 页、托盘图标），随 dist 打进 asar */
export const ASSETS_DIR = join(APP_ROOT, 'dist', 'assets')
