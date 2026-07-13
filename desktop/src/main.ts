// ─────────────────────────────────────────────
// main — Electron 主进程入口
// 单实例锁 / 窗口 / 托盘 / sidecar 编排 / 优雅退出
//
// 运行模式：
//   默认           spawn sidecar 产物（out/server 或 resources/server）
//   AUTOMAN_DEV=1  不 spawn，直连 tsx watch(3000) + vite dev(5173)
//   --smoke        无人值守冒烟：启动成功 3s 后自动退出（CI 用）
// ─────────────────────────────────────────────

import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'node:path'
import { ASSETS_DIR, LOGS_DIR } from './paths.js'
import { Sidecar } from './sidecar.js'
import { readSettings, writeSettings } from './settings.js'
import { createTray, getTray } from './tray.js'

const DEV_MODE = process.env.AUTOMAN_DEV === '1'
const SMOKE_MODE = process.argv.includes('--smoke')

let win: BrowserWindow | null = null
let sidecar: Sidecar | null = null
let quitting = false
let cleanupDone = false

function appUrl(port: number): string {
  return `http://127.0.0.1:${port}/login?port=${port}&autoconnect=1`
}

function showWindow(): void {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return
  }
  win = createWindow()
  if (DEV_MODE) void win.loadURL('http://localhost:5173')
  else if (sidecar && sidecar.port > 0) void win.loadURL(appUrl(sidecar.port))
}

function quitApp(): void {
  quitting = true
  app.quit()
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: '凹凸曼 Automan',
    ...(process.platform !== 'darwin' ? { icon: join(ASSETS_DIR, 'icon.png') } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  w.once('ready-to-show', () => w.show())

  // 页面内外链（GitHub 等）走系统浏览器
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' }
    }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 关窗默认最小化到托盘（挂机场景），设置 minimizeToTray=false 时直接退出
  w.on('close', (e) => {
    if (quitting) return
    if (!readSettings().minimizeToTray) {
      quitApp()
      return
    }
    e.preventDefault()
    w.hide()
    if (!readSettings().trayTipShown) {
      writeSettings({ trayTipShown: true })
      // Windows 托盘气泡；mac 无此 API，静默
      getTray()?.displayBalloon?.({
        title: '凹凸曼仍在运行',
        content: '窗口已最小化到托盘，脚本继续在后台执行。右键托盘图标可退出。',
      })
    }
  })
  return w
}

function buildAppMenu(): Menu | null {
  // mac 需要基础菜单提供 Cmd+C/V/Q 快捷键；Windows 隐藏菜单栏
  if (process.platform !== 'darwin') return null
  return Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
}

async function bootstrap(): Promise<void> {
  await app.whenReady()
  if (process.platform === 'win32') app.setAppUserModelId('com.automan.desktop')
  Menu.setApplicationMenu(buildAppMenu())

  win = createWindow()
  void win.loadFile(join(ASSETS_DIR, 'loading.html'))

  createTray({
    onOpen: showWindow,
    onQuit: quitApp,
    onLanToggled: () => {
      void dialog.showMessageBox({
        type: 'info',
        message: '设置已保存，重启应用后生效。',
        detail: '开启局域网访问后，首次启动 Windows 会弹出防火墙提示，请勾选「专用网络」并允许。',
        buttons: ['知道了'],
      })
    },
  })

  if (DEV_MODE) {
    void win.loadURL('http://localhost:5173')
    return
  }

  sidecar = new Sidecar()
  sidecar.onRestarted = ({ port }) => {
    if (win && !win.isDestroyed()) void win.loadURL(appUrl(port))
  }
  const smokeFail = (msg: string): void => {
    console.error(`[smoke] FAIL: ${msg}`)
    // 先停掉可能存活/正在重启的 sidecar，避免 CI 上残留进程
    void sidecar?.stop().finally(() => process.exit(1))
  }

  sidecar.onFatal = (msg) => {
    if (SMOKE_MODE) {
      smokeFail(msg)
      return
    }
    dialog.showErrorBox('凹凸曼服务异常', msg)
    quitApp()
  }

  try {
    const info = await sidecar.start()
    await win.loadURL(appUrl(info.port))
    if (SMOKE_MODE) {
      console.log(`[smoke] app ready on port ${info.port}`)
      setTimeout(quitApp, 3000)
    }
  } catch (err) {
    if (SMOKE_MODE) {
      smokeFail((err as Error).message)
      return
    }
    dialog.showErrorBox('凹凸曼启动失败', `${(err as Error).message}\n\n日志目录：${LOGS_DIR}`)
    quitApp()
  }
}

// ── 应用级事件 ──────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('activate', showWindow) // mac dock 点击
  app.on('window-all-closed', () => {
    /* 托盘驻留，不随窗口关闭退出 */
  })
  // 退出前优雅停 sidecar（stdin 通道 → server onClose 全清 → 超时 killTree 兜底）
  app.on('before-quit', (e) => {
    quitting = true
    if (cleanupDone || !sidecar) return
    e.preventDefault()
    void sidecar.stop().finally(() => {
      cleanupDone = true
      app.quit()
    })
  })
  void bootstrap()
}
