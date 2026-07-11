// ─────────────────────────────────────────────
// src/libs — 工具与脚本统一导出层
//
// 所有外部模块通过 import { ... } from '../libs/index.js' 引入
//
// 文件结构：
//   python-helper.ts  — Python 进程调用封装（通用）
//   find-pic.ts       — 找图 API（业务）
//   find-pic-pro.ts   — 找图 Pro API（SIFT + FLANN + RANSAC）
//   ocr.ts            — OCR 文字识别 API（业务）
//   find_pic.py       — Python 找图脚本
//   find_pic_pro.py   — Python 找图 Pro 脚本
//   ocr.py            — Python OCR 脚本
//   requirements.txt  — Python 依赖清单
// ─────────────────────────────────────────────

// ── 找图 API ──────────────────────────────────
export { findPic } from './find-pic.js'
export type { FindPicOptions, FindPicMatch, FindPicResult } from './find-pic.js'

// ── 找图 Pro API（SIFT + FLANN + RANSAC）──
export { findPicPro } from './find-pic-pro.js'
export type { FindPicProOptions, FindPicProMatch, FindPicProResult } from './find-pic-pro.js'

// ── OCR API ───────────────────────────────────
export { getWords, findStr } from './ocr.js'
export type {
  GetWordsOptions,
  GetWordsResult,
  FindStrOptions,
  FindStrResult,
  OcrWord,
  OcrMatch,
  OcrColor,
} from './ocr.js'

// ── ADB 点击 API ─────────────────────────────
export { adbClick, adbAreaClick } from './adb-click.js'
export type { AdbClickResult } from './adb-click.js'

// ── Python 工具（供其他业务扩展使用） ─────────
export { runPythonScript, getPythonPath, getScriptPath, PythonWorker } from './python-helper.js'
export type { PyOutput } from './python-helper.js'
