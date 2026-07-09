// ─────────────────────────────────────────────
// src/libs — 工具与脚本统一导出层
//
// 所有外部模块通过 import { ... } from '../libs/index.js' 引入
//
// 文件结构：
//   python-helper.ts  — Python 进程调用封装（通用）
//   find-pic.ts       — 找图 API（业务）
//   find_pic.py       — Python 找图脚本
//   requirements.txt  — Python 依赖清单
// ─────────────────────────────────────────────

// ── 找图 API ──────────────────────────────────
export { findPic } from './find-pic.js'
export type { FindPicOptions, FindPicMatch, FindPicResult } from './find-pic.js'

// ── Python 工具（供其他业务扩展使用） ─────────
export { runPythonScript, getPythonPath, getScriptPath } from './python-helper.js'
export type { PyOutput } from './python-helper.js'
