// ─────────────────────────────────────────────
// adb-swipe — 高阶拟人滑动 ADB 操作
//
// 两步分离：
//   1. 纯计算（同步）—— Bezier + smoothstep → trajectory（前端动画用）
//   2. 单次 adb shell input swipe（避免分段短距被识别为 tap）
//
// 返回完整轨迹点供前端动画回显。
//
// 使用方：import { adbSwipe } from '../libs/index.js'
// ─────────────────────────────────────────────

import { execFile } from 'node:child_process'
import { logger } from '../core/logger.js'
import type { SwipePoint, AdbSwipeResponse } from '../../../shared/src/types.js'

/** ADB swipe 命令超时（毫秒） */
const ADB_SWIPE_TIMEOUT = 15_000

// ── 数学工具 ─────────────────────────────────

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max))
}

/** 二次 Bezier 插值 */
function bezier(t: number, p0: number, p1: number, p2: number): number {
  return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2
}

/** smoothstep 缓动（拟人加速-减速） */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 从矩形区域内随机取点（含 padding 内缩） */
function pickPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  padding: number,
): { x: number; y: number } {
  const minX = Math.min(x1, x2) + padding
  const maxX = Math.max(x1, x2) - padding
  const minY = Math.min(y1, y2) + padding
  const maxY = Math.max(y1, y2) - padding
  return { x: rand(minX, maxX), y: rand(minY, maxY) }
}

// ── 轨迹计算（纯同步） ──────────────────────

/**
 * 计算拟人滑动轨迹（不执行 ADB）
 *
 * @param startRegion 起点矩形 [x1, y1, x2, y2]
 * @param endRegion   终点矩形 [x1, y1, x2, y2]
 * @param padding     区域边界安全偏移
 * @param steps       分段数（默认 12~20 随机）
 * @returns 完整轨迹点数组（含起点 t=0）
 */
export function computeSwipeTrajectory(
  startRegion: [number, number, number, number],
  endRegion: [number, number, number, number],
  padding = 0,
  steps?: number,
): { trajectory: SwipePoint[]; startX: number; startY: number; endX: number; endY: number; totalDuration: number } {
  const actualSteps = steps ?? randInt(12, 20)

  // 1. 从区域取点
  const start = pickPoint(...startRegion, padding)
  const end = pickPoint(...endRegion, padding)
  const startX = start.x
  const startY = start.y
  const endX = end.x
  const endY = end.y

  // 2. 控制点（决定曲线弯曲）
  const midX = (startX + endX) / 2 + rand(-50, 50)
  const midY = (startY + endY) / 2 + rand(-50, 50)

  // 3. 距离 → 时间
  const distance = Math.max(Math.abs(endX - startX), Math.abs(endY - startY))
  const baseSpeed = rand(1.2, 2.0)
  let totalDuration = distance / baseSpeed
  totalDuration *= rand(0.85, 1.15)
  totalDuration = Math.max(200, Math.min(1500, totalDuration))

  // 4. 分段计算轨迹
  const trajectory: SwipePoint[] = [{ x: Math.floor(startX), y: Math.floor(startY), t: 0 }]

  let cumulativeTime = 0
  for (let i = 1; i <= actualSteps; i++) {
    let t = i / actualSteps
    t = smoothstep(t)

    let currX = bezier(t, startX, midX, endX)
    let currY = bezier(t, startY, midY, endY)

    // 微抖动
    currX += rand(-2, 2)
    currY += rand(-2, 2)

    const segmentDuration = (totalDuration / actualSteps) * rand(0.7, 1.3)
    cumulativeTime += segmentDuration

    trajectory.push({ x: Math.floor(currX), y: Math.floor(currY), t: Math.floor(cumulativeTime) })
  }

  return { trajectory, startX: Math.floor(startX), startY: Math.floor(startY), endX: Math.floor(endX), endY: Math.floor(endY), totalDuration }
}

// ── 主函数 ───────────────────────────────────

/**
 * 高阶拟人滑动（区域 → 区域）
 *
 * 先计算完整轨迹（前端动画用），再用单次 adb swipe 执行滑动。
 * 回弹用连续第二次 swipe（从终点滑出），不会被识别为 tap。
 *
 * @example
 * ```ts
 * import { adbSwipe } from '../libs/index.js'
 *
 * const result = await adbSwipe(adbPath, '127.0.0.1:5555',
 *   [100, 200, 300, 400],   // 起点区域
 *   [500, 800, 700, 1000],  // 终点区域
 * )
 * console.log(`滑动 ${result.elapsed}ms, 轨迹点: ${result.trajectory.length}`)
 * ```
 */
export async function adbSwipe(
  adbPath: string,
  target: string,
  startRegion: [number, number, number, number],
  endRegion: [number, number, number, number],
  options?: { padding?: number; steps?: number },
): Promise<AdbSwipeResponse> {
  const { padding = 0, steps } = options || {}

  // Step 1: 纯计算轨迹（前端动画用，不用于 ADB 执行）
  const { trajectory, startX, startY, endX, endY, totalDuration } = computeSwipeTrajectory(
    startRegion, endRegion, padding, steps,
  )

  const t0 = Date.now()
  const duration = Math.floor(totalDuration)

  logger.info('adbSwipe', `${target} swipe (${startX},${startY}) → (${endX},${endY}), ${duration}ms`)

  // Step 2: 单次 swipe（避免分段短距被识别为 tap）
  await runAdbSwipe(adbPath, target, startX, startY, endX, endY, duration)

  // Step 3: 偶尔连续回弹（15% 概率，从终点滑出，不间断）
  if (Math.random() < 0.15) {
    const bounceX = endX + Math.floor(rand(-15, 15))
    const bounceY = endY + Math.floor(rand(80, 150))
    const bounceDur = randInt(150, 300)
    await runAdbSwipe(adbPath, target, endX, endY, bounceX, bounceY, bounceDur)
  }

  const elapsed = Date.now() - t0
  logger.info('adbSwipe', `ok, ${elapsed}ms`)

  return {
    startX,
    startY,
    endX,
    endY,
    steps: trajectory.length - 1,
    elapsed,
    trajectory,
  }
}

// ── 内部工具 ─────────────────────────────────

function runAdbSwipe(
  adbPath: string,
  target: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      adbPath,
      [
        '-s', target,
        'shell', 'input', 'swipe',
        String(x1), String(y1), String(x2), String(y2), String(Math.floor(duration)),
      ],
      { timeout: ADB_SWIPE_TIMEOUT, windowsHide: true, encoding: 'buffer' },
      (err) => {
        if (err) {
          logger.error('adbSwipe', `swipe failed: ${err.message}`)
          reject(new Error(`ADB swipe 失败: ${err.message}`))
          return
        }
        resolve()
      },
    )
  })
}
