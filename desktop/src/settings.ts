// ─────────────────────────────────────────────
// settings — 桌面端设置（userData/settings.json）
// ─────────────────────────────────────────────

import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface DesktopSettings {
  /** 允许局域网访问（sidecar 监听 0.0.0.0，重启应用生效） */
  lanAccess: boolean
  /** 上次成功使用的端口，优先复用以保住浏览器 localStorage（按 origin 隔离） */
  lastPort: number
  /** 关闭窗口时最小化到托盘（false = 直接退出） */
  minimizeToTray: boolean
  /** 是否已提示过「最小化到托盘」气泡 */
  trayTipShown: boolean
}

const DEFAULTS: DesktopSettings = {
  lanAccess: false,
  lastPort: 3000,
  minimizeToTray: true,
  trayTipShown: false,
}

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

export function readSettings(): DesktopSettings {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DesktopSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  const next = { ...readSettings(), ...patch }
  try {
    mkdirSync(dirname(SETTINGS_PATH), { recursive: true })
    writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2))
  } catch (err) {
    console.error('[settings] write failed:', (err as Error).message)
  }
  return next
}
