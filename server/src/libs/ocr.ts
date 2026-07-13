// ─────────────────────────────────────────────
// ocr — OCR 文字识别核心 API
//
// 提供 getWords() 和 findStr() 两个接口，
// 底层通过 Python + RapidOCR 实现。
//
// 使用方：import { getWords, findStr } from '../libs/index.js'
// ─────────────────────────────────────────────

import { PythonWorker } from './python-helper.js'
import { logger } from '../core/logger.js'

// ── 类型定义 ──────────────────────────────────

/** 预设颜色名称 */
export type OcrColorPreset =
  'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'white' | 'black' | 'gray'

/** 颜色：预设名称 或 任意 hex (#RRGGBB / #RGB) 或 rgb (r,g,b) */
export type OcrColor = OcrColorPreset | (string & {})

/** OCR 识别到的单个文字块 */
export interface OcrWord {
  /** 识别出的文字 */
  text: string
  /** 左上角 X（原始截图分辨率） */
  x: number
  /** 左上角 Y（原始截图分辨率） */
  y: number
  /** 文字块宽度 */
  w: number
  /** 文字块高度 */
  h: number
  /** 置信度 0-1 */
  confidence: number
}

/** getWords 输入参数 */
export interface GetWordsOptions {
  /** 截图 base64（支持 data:image/png;base64,... 或纯 base64） */
  image: string
  /** 识别区域 [x1, y1, x2, y2]，全为 0 或不传表示全图 */
  region?: [number, number, number, number]
  /** 文字颜色过滤，不传则识别所有颜色 */
  color?: OcrColor
  /** 颜色偏差 0-100，默认 50。值越大容差越宽 */
  colorTolerance?: number
}

/** getWords 结果 */
export interface GetWordsResult {
  /** 识别到的文字列表 */
  words: OcrWord[]
  /** 总耗时（毫秒） */
  elapsed: number
}

/** findStr 匹配结果（在 OcrWord 基础上增加相似度） */
export interface OcrMatch extends OcrWord {
  /** 文字匹配相似度 0-1 */
  similarity: number
}

/** findStr 输入参数 */
export interface FindStrOptions {
  /** 截图 base64 */
  image: string
  /** 要查找的文字 */
  target: string
  /** 查找区域 [x1, y1, x2, y2]，全为 0 或不传表示全图 */
  region?: [number, number, number, number]
  /** 相似度阈值 0-1，默认 0.8 */
  similarity?: number
  /** 文字颜色过滤 */
  color?: OcrColor
  /** 颜色偏差 0-100，默认 50。值越大容差越宽 */
  colorTolerance?: number
}

/** findStr 结果 */
export interface FindStrResult {
  /** 匹配结果列表（按相似度降序） */
  matches: OcrMatch[]
  /** OCR 识别到的所有文字（调试用） */
  allWords: string[]
  /** 总耗时（毫秒） */
  elapsed: number
}

/** Python 输出格式（内部） */
interface OcrPyOutput {
  words?: OcrWord[]
  matches?: OcrMatch[]
  allWords?: string[]
  elapsed?: number
  error?: string
  [key: string]: unknown
}

// ── 公开函数 ──────────────────────────────────

/** OCR 持久化工作进程（模型只加载一次，后续调用直接通信） */
const ocrWorker = new PythonWorker('ocr.py')

/** 销毁 OCR 工作进程（服务关闭时调用，防止 python 进程残留） */
export function destroyOcrWorker(): void {
  ocrWorker.destroy()
}

/**
 * 获取文字（OCR 识别）
 *
 * 识别截图中的所有文字，支持区域裁切和颜色过滤。
 *
 * @example
 * ```ts
 * import { getWords } from '../libs/index.js'
 *
 * const result = await getWords({
 *   image: screenshotBase64,
 *   region: [100, 50, 800, 600],
 *   color: 'red',
 * })
 *
 * for (const word of result.words) {
 *   console.log(`[${word.x},${word.y}] ${word.text} (${word.confidence})`)
 * }
 * ```
 */
export async function getWords(options: GetWordsOptions): Promise<GetWordsResult> {
  const { image, region = [0, 0, 0, 0], color, colorTolerance = 50 } = options

  if (!image) {
    throw new Error('image 为必填')
  }

  const t0 = Date.now()

  const pyResult = await ocrWorker.send<OcrPyOutput>({
    action: 'getWords',
    image,
    region,
    color: color ?? null,
    colorTolerance,
  })

  if (pyResult.error) {
    logger.error('getWords', `底层错误: ${pyResult.error}`)
    throw new Error(pyResult.error)
  }

  const words: OcrWord[] = (pyResult.words ?? []).map((w) => ({
    text: w.text,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    confidence: w.confidence,
  }))

  const elapsed = Date.now() - t0
  logger.info('getWords', `${words.length} words, py=${pyResult.elapsed}ms, total=${elapsed}ms`)

  return { words, elapsed }
}

/**
 * 找字（OCR + 文字匹配）
 *
 * 在截图中查找指定文字，支持区域裁切、颜色过滤和相似度控制。
 *
 * @example
 * ```ts
 * import { findStr } from '../libs/index.js'
 *
 * const result = await findStr({
 *   image: screenshotBase64,
 *   target: '确认',
 *   similarity: 0.9,
 * })
 *
 * if (result.matches.length > 0) {
 *   const { x, y, w, h } = result.matches[0]
 *   console.log(`找到文字 "${result.matches[0].text}" 在 (${x}, ${y})`)
 * }
 * ```
 */
export async function findStr(options: FindStrOptions): Promise<FindStrResult> {
  const {
    image,
    target,
    region = [0, 0, 0, 0],
    similarity = 0.8,
    color,
    colorTolerance = 50,
  } = options

  if (!image || !target) {
    throw new Error('image 和 target 均为必填')
  }

  const t0 = Date.now()

  const pyResult = await ocrWorker.send<OcrPyOutput>({
    action: 'findStr',
    image,
    target,
    region,
    similarity,
    color: color ?? null,
    colorTolerance,
  })

  if (pyResult.error) {
    logger.error('findStr', `底层错误: ${pyResult.error}`)
    throw new Error(pyResult.error)
  }

  const matches: OcrMatch[] = (pyResult.matches ?? []).map((m) => ({
    text: m.text,
    x: m.x,
    y: m.y,
    w: m.w,
    h: m.h,
    confidence: m.confidence,
    similarity: m.similarity,
  }))

  const elapsed = Date.now() - t0
  logger.info('findStr', `${matches.length} matches, py=${pyResult.elapsed}ms, total=${elapsed}ms`)
  if (matches.length === 0) {
    logger.warn('findStr', `OCR 识别到的文字: ${JSON.stringify(pyResult.allWords ?? [])}`)
  }

  return { matches, allWords: pyResult.allWords ?? [], elapsed }
}
