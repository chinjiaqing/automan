// ─────────────────────────────────────────────
// find-pic-pro — 高鲁棒性找图（SIFT + FLANN + RANSAC）
//
// 对缩放、旋转、光照变化的动态图片具有强识别能力。
// 当 SIFT 特征点不足时自动回退到多尺度模板匹配。
//
// 使用方：import { findPicPro } from '../libs/index.js'
// ─────────────────────────────────────────────

import { runPythonScript, getScriptPath } from './python-helper.js'
import { logger } from '../core/logger.js'

// ── 类型定义 ──────────────────────────────────

/** findPicPro 输入参数 */
export interface FindPicProOptions {
  /** 截图 base64（支持 data:image/png;base64,... 或纯 base64） */
  image: string
  /** 模板图片 base64 */
  template: string
  /** 相似度阈值 0-1，默认 0.8（多尺度兜底时使用） */
  threshold?: number
  /** 最大匹配数量，默认 10 */
  maxResults?: number
  /** 搜索区域 [x1, y1, x2, y2]，全为 0 或不传表示全图 */
  region?: [number, number, number, number]
  /** 多尺度缩放列表（兜底时使用），默认 [0.5, 0.75, 1.0, 1.25, 1.5] */
  scales?: number[]
  /** SIFT 最少特征点数，默认 4。低于此值回退多尺度匹配 */
  minFeatures?: number
}

/** 单个匹配结果 */
export interface FindPicProMatch {
  /** 匹配位置 X（原始截图分辨率） */
  x: number
  /** 匹配位置 Y（原始截图分辨率） */
  y: number
  /** 置信度 0-1 */
  confidence: number
  /** 匹配方法：sift | multiscale | none */
  method: string
}

/** findPicPro 结果 */
export interface FindPicProResult {
  /** 匹配结果列表（按置信度降序） */
  matches: FindPicProMatch[]
  /** 总耗时（毫秒，含进程通信开销） */
  elapsed: number
  /** 实际使用的匹配方法：sift | multiscale | none */
  method: string
}

/** Python 输出格式（内部） */
interface FindPicProPyOutput {
  matches?: { x: number; y: number; confidence: number; method: string }[]
  elapsed?: number
  method?: string
  error?: string
  [key: string]: unknown
}

// ── 公开函数 ──────────────────────────────────

/** 找图脚本路径 */
const FIND_PIC_PRO_SCRIPT = getScriptPath('find_pic_pro.py')

/**
 * 高鲁棒性找图（SIFT + FLANN + RANSAC）
 *
 * 在截图中搜索模板图片，对缩放、旋转、光照变化具有鲁棒性。
 * 优先使用 SIFT 特征匹配，特征点不足时自动回退到多尺度模板匹配。
 *
 * @example
 * ```ts
 * import { findPicPro } from '../libs/index.js'
 *
 * const result = await findPicPro({
 *   image: screenshotBase64,
 *   template: templateBase64,
 *   threshold: 0.85,
 *   region: [100, 50, 800, 600],
 * })
 *
 * if (result.matches.length > 0) {
 *   const { x, y, method } = result.matches[0]
 *   console.log(`[${method}] 找到目标: (${x}, ${y})`)
 * }
 * ```
 */
export async function findPicPro(options: FindPicProOptions): Promise<FindPicProResult> {
  const {
    image,
    template,
    threshold = 0.8,
    maxResults = 10,
    region = [0, 0, 0, 0],
    scales,
    minFeatures = 4,
  } = options

  if (!image || !template) {
    throw new Error('image 和 template 均为必填')
  }

  const t0 = Date.now()

  const pyInput = JSON.stringify({
    image,
    template,
    threshold,
    maxResults,
    region,
    scales: scales ?? undefined,
    minFeatures,
  })

  const pyResult = await runPythonScript<FindPicProPyOutput>(FIND_PIC_PRO_SCRIPT, pyInput)

  if (pyResult.error) {
    logger.error('findPicPro', `底层错误: ${pyResult.error}`)
    throw new Error(pyResult.error)
  }

  const matches: FindPicProMatch[] = (pyResult.matches ?? []).map((m) => ({
    x: m.x,
    y: m.y,
    confidence: m.confidence,
    method: m.method,
  }))

  const method = pyResult.method ?? 'none'
  const elapsed = Date.now() - t0
  logger.info('findPicPro', `[${method}] ${matches.length} matches, py=${pyResult.elapsed}ms, total=${elapsed}ms`)

  return { matches, elapsed, method }
}
