// ─────────────────────────────────────────────
// make-icons — 从 web/public/logo.png 生成桌面端图标
//   build/icon.png   512×512（electron-builder 自动转 ico/icns）
//   assets/icon.png  256×256（Windows 窗口图标）
//   assets/tray.png / tray@2x.png  托盘图标（16/32）
// 生成物提交进 git（稳定资产），logo 变更时重跑本脚本。
// ─────────────────────────────────────────────

import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESKTOP_DIR = resolve(__dirname, '..')
const LOGO = resolve(DESKTOP_DIR, '..', 'web', 'public', 'logo.png')

mkdirSync(join(DESKTOP_DIR, 'build'), { recursive: true })
mkdirSync(join(DESKTOP_DIR, 'assets'), { recursive: true })

const jobs = [
  { size: 512, out: join(DESKTOP_DIR, 'build', 'icon.png') },
  { size: 256, out: join(DESKTOP_DIR, 'assets', 'icon.png') },
  { size: 16, out: join(DESKTOP_DIR, 'assets', 'tray.png') },
  { size: 32, out: join(DESKTOP_DIR, 'assets', 'tray@2x.png') },
]

for (const { size, out } of jobs) {
  await sharp(LOGO)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  console.log(`[make-icons] ${out} (${size}×${size})`)
}
