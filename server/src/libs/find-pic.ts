// ─────────────────────────────────────────────
// find-pic — 找图（模板匹配）核心 API
//
// 这是对外暴露的稳定接口，无论底层用 Python OpenCV
// 还是其他实现，此函数的签名和行为永远不变。
//
// 使用方：import { findPic } from '../libs/index.js'
// ─────────────────────────────────────────────

import { runPythonScript, getScriptPath } from './python-helper.js'
import { logger } from '../core/logger.js'

// ── 类型定义 ──────────────────────────────────

/** 找图输入参数 */
export interface FindPicOptions {
  /** 截图 base64（支持 data:image/png;base64,... 或纯 base64） */
  image: string
  /** 模板图片 base64 */
  template: string
  /** 相似度阈值 0-1，默认 0.8 */
  threshold?: number
  /** 最大匹配数量，默认 10 */
  maxResults?: number
  /** 搜索区域 [x1, y1, x2, y2]，全为 0 或不传表示全图 */
  region?: [number, number, number, number]
}

/** 单个匹配结果 */
export interface FindPicMatch {
  /** 匹配位置 X（原始截图分辨率） */
  x: number
  /** 匹配位置 Y（原始截图分辨率） */
  y: number
  /** 置信度 0-1 */
  confidence: number
}

/** 找图结果 */
export interface FindPicResult {
  /** 匹配结果列表（按置信度降序） */
  matches: FindPicMatch[]
  /** 总耗时（毫秒，含进程通信开销） */
  elapsed: number
}

/** Python 输出格式（内部） */
interface FindPicPyOutput {
  matches?: { x: number; y: number; confidence: number }[]
  elapsed?: number
  error?: string
  [key: string]: unknown
}

// ── 公开函数 ──────────────────────────────────

/** 找图脚本路径 */
const FIND_PIC_SCRIPT = getScriptPath('find_pic.py')

/**
 * 找图（模板匹配）
 *
 * 在截图中搜索模板图片，返回所有匹配位置。
 *
 * @example
 * ```ts
 * import { findPic } from '../libs/index.js'
 *
 * const result = await findPic({
 *   image: screenshotBase64,
 *   template: templateBase64,
 *   threshold: 0.85,
 *   region: [100, 50, 800, 600],
 * })
 *
 * if (result.matches.length > 0) {
 *   const { x, y } = result.matches[0]
 *   console.log(`找到目标: (${x}, ${y})`)
 * }
 * ```
 */
export async function findPic(options: FindPicOptions): Promise<FindPicResult> {
  const {
    image,
    template,
    threshold = 0.8,
    maxResults = 10,
    region = [0, 0, 0, 0],
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
  })

  const pyResult = await runPythonScript<FindPicPyOutput>(FIND_PIC_SCRIPT, pyInput)

  if (pyResult.error) {
    logger.error('findPic', `底层错误: ${pyResult.error}`)
    throw new Error(pyResult.error)
  }

  const matches: FindPicMatch[] = (pyResult.matches ?? []).map((m) => ({
    x: m.x,
    y: m.y,
    confidence: m.confidence,
  }))

  const elapsed = Date.now() - t0
  logger.info('findPic', `${matches.length} matches, py=${pyResult.elapsed}ms, total=${elapsed}ms`)

  return { matches, elapsed }
}
