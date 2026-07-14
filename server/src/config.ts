// ─────────────────────────────────────────────
// config — 全局配置加载器
// 职责：读取 automan.config.json5，提供类型安全的配置访问接口
// ─────────────────────────────────────────────

import JSON5 from 'json5'
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 项目根目录（server/src → server → project root） */
const PROJECT_ROOT = resolve(__dirname, '..', '..')

/** ADB 可执行文件路径（内置于 runtime 目录，无需用户配置） */
export const ADB_PATH = join(PROJECT_ROOT, 'runtime', 'adb.exe')

/** 配置类型定义 */
export interface AutomanConfig {
  resolution: {
    width: number
    height: number
  }
  screenshot: {
    interval: number
  }
}

/** 默认配置（配置文件缺失时使用） */
const DEFAULT_CONFIG: AutomanConfig = {
  resolution: { width: 1280, height: 720 },
  screenshot: { interval: 2000 },
}

function loadConfig(): AutomanConfig {
  const configPath = resolve(__dirname, '..', 'automan.config.json5')
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const parsed = JSON5.parse<Partial<AutomanConfig>>(raw)
    // 深度合并：以默认值为底，配置文件覆盖
    return {
      resolution: {
        ...DEFAULT_CONFIG.resolution,
        ...parsed.resolution,
      },
      screenshot: {
        ...DEFAULT_CONFIG.screenshot,
        ...parsed.screenshot,
      },
    }
  } catch (err) {
    console.warn(`[config] 无法读取配置文件 (${configPath})，使用默认配置:`, (err as Error).message)
    return DEFAULT_CONFIG
  }
}

/** 全局配置单例 */
export const config: AutomanConfig = loadConfig()
