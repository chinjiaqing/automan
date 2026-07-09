// ─────────────────────────────────────────────
// adb-click — ADB 点击操作封装
//
// 提供单点点击和范围随机点击两种能力，
// 底层通过 adb shell input tap 实现。
//
// 使用方：import { adbClick, adbAreaClick } from '../libs/index.js'
// ─────────────────────────────────────────────

import { execFile } from 'node:child_process'
import { logger } from '../core/logger.js'

/** ADB 点击命令超时（毫秒） */
const ADB_TAP_TIMEOUT = 5_000

/** 点击结果 */
export interface AdbClickResult {
  /** 实际点击的 X 坐标 */
  x: number
  /** 实际点击的 Y 坐标 */
  y: number
  /** 耗时（毫秒） */
  elapsed: number
}

/**
 * 单点点击
 *
 * 通过 ADB 在指定坐标执行一次点击。
 *
 * @example
 * ```ts
 * import { adbClick } from '../libs/index.js'
 *
 * const result = await adbClick(adbPath, '127.0.0.1:5555', [540, 960])
 * console.log(`点击了 (${result.x}, ${result.y})`)
 * ```
 */
export async function adbClick(
  adbPath: string,
  target: string,
  point: [number, number],
): Promise<AdbClickResult> {
  const t0 = Date.now()
  const rx = Math.round(point[0])
  const ry = Math.round(point[1])

  logger.info('adbClick', `${target} click ${rx} ${ry}`)

  await runAdbClick(adbPath, target, rx, ry)

  const elapsed = Date.now() - t0
  logger.info('adbClick', `ok, ${elapsed}ms`)
  return { x: rx, y: ry, elapsed }
}

/**
 * 范围随机点击
 *
 * 在 [x1, y1] ~ [x2, y2] 矩形区域内随机取一个点进行点击。
 *
 * @example
 * ```ts
 * import { adbAreaClick } from '../libs/index.js'
 *
 * const result = await adbAreaClick(adbPath, '127.0.0.1:5555', [100, 200, 300, 400])
 * console.log(`随机点击了 (${result.x}, ${result.y})`)
 * ```
 */
export async function adbAreaClick(
  adbPath: string,
  target: string,
  region: [number, number, number, number],
): Promise<AdbClickResult> {
  const [x1, y1, x2, y2] = region
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)

  const rx = Math.round(minX + Math.random() * (maxX - minX))
  const ry = Math.round(minY + Math.random() * (maxY - minY))

  const t0 = Date.now()

  logger.info('adbAreaClick', `${target} click ${rx} ${ry} (area: [${x1},${y1},${x2},${y2}])`)

  await runAdbClick(adbPath, target, rx, ry)

  const elapsed = Date.now() - t0
  logger.info('adbAreaClick', `ok, ${elapsed}ms`)
  return { x: rx, y: ry, elapsed }
}

// ── 内部工具 ──────────────────────────────────

function runAdbClick(adbPath: string, target: string, x: number, y: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      adbPath,
      ['-s', target, 'shell', 'input', 'tap', String(x), String(y)],
      { timeout: ADB_TAP_TIMEOUT, windowsHide: true, encoding: 'buffer' },
      (err) => {
        if (err) {
          logger.error('adbClick', `failed: ${err.message}`)
          reject(new Error(`ADB tap 失败: ${err.message}`))
          return
        }
        resolve()
      },
    )
  })
}
