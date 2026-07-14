// ─────────────────────────────────────────────
// coordinate — 坐标转换工具
// 职责：标准空间（最长边 1280）⇄ 实际设备空间的坐标互转
// ─────────────────────────────────────────────

import { config } from '../../config.js'

/** 坐标缩放因子（标准空间 → 实际设备空间） */
export interface ScaleFactor {
  scaleX: number         // 实际宽 / 标准宽
  scaleY: number         // 实际高 / 标准高
  actualWidth: number
  actualHeight: number
  standardWidth: number
  standardHeight: number
}

/** 计算缩放因子（Math.floor 防越界） */
export function computeScaleFactor(actualW: number, actualH: number): ScaleFactor {
  const maxEdge = config.resolution.width  // 1280
  const scale = maxEdge / Math.max(actualW, actualH)
  const standardW = Math.floor(actualW * scale)
  const standardH = Math.floor(actualH * scale)
  return {
    scaleX: actualW / standardW,
    scaleY: actualH / standardH,
    actualWidth: actualW,
    actualHeight: actualH,
    standardWidth: standardW,
    standardHeight: standardH,
  }
}

/** 标准坐标 → 实际坐标（单点，clamp 防越界） */
export function toActualPoint(x: number, y: number, sf: ScaleFactor): [number, number] {
  return [
    Math.min(Math.floor(x * sf.scaleX), sf.actualWidth - 1),
    Math.min(Math.floor(y * sf.scaleY), sf.actualHeight - 1),
  ]
}

/** 标准坐标 → 实际坐标（矩形区域，clamp 防越界） */
export function toActualRegion(
  r: [number, number, number, number],
  sf: ScaleFactor,
): [number, number, number, number] {
  return [
    Math.min(Math.floor(r[0] * sf.scaleX), sf.actualWidth - 1),
    Math.min(Math.floor(r[1] * sf.scaleY), sf.actualHeight - 1),
    Math.min(Math.floor(r[2] * sf.scaleX), sf.actualWidth - 1),
    Math.min(Math.floor(r[3] * sf.scaleY), sf.actualHeight - 1),
  ]
}
