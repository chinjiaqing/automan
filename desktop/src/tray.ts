// ─────────────────────────────────────────────
// tray — 系统托盘（后台挂机的常驻入口）
// ─────────────────────────────────────────────

import { Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { ASSETS_DIR } from './paths.js'
import { readSettings, writeSettings } from './settings.js'

export interface TrayHandlers {
  onOpen: () => void
  onQuit: () => void
  onLanToggled: (enabled: boolean) => void
}

let tray: Tray | null = null

export function getTray(): Tray | null {
  return tray
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(join(ASSETS_DIR, 'tray.png'))
  tray = new Tray(icon)
  tray.setToolTip('凹凸曼 Automan')
  rebuildMenu(handlers)
  tray.on('double-click', handlers.onOpen) // Windows：双击托盘打开面板
  return tray
}

function rebuildMenu(handlers: TrayHandlers): void {
  if (!tray) return
  const settings = readSettings()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开面板', click: handlers.onOpen },
      { type: 'separator' },
      {
        label: '局域网访问（重启生效）',
        type: 'checkbox',
        checked: settings.lanAccess,
        click: (item) => {
          writeSettings({ lanAccess: item.checked })
          rebuildMenu(handlers)
          handlers.onLanToggled(item.checked)
        },
      },
      { type: 'separator' },
      { label: '退出', click: handlers.onQuit },
    ]),
  )
}
