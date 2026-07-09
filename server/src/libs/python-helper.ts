// ─────────────────────────────────────────────
// python-helper — Python 进程调用封装
//
// 职责：
//   - 获取项目内 .venv Python 路径
//   - spawn Python 脚本 + stdin/stdout JSON 通信
//
// 本文件不包含任何业务逻辑，仅供 Python 调用工具
// ─────────────────────────────────────────────

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── 路径常量 ─────────────────────────────────

/** server/ 根目录 */
const SERVER_ROOT = join(__dirname, '..', '..')

/** 项目根目录（server/ 的父目录） */
const PROJECT_ROOT = join(SERVER_ROOT, '..')

/** Python 脚本目录（src/libs/，与本文件同目录） */
const LIBS_DIR = __dirname

/** .bin/python/ — 分发用 embeddable Python */
const DOTBIN_PYTHON = join(PROJECT_ROOT, '.bin', 'python', 'python.exe')

/** server/.venv/ — 开发者本地 venv（回退） */
const VENV_PYTHON = join(SERVER_ROOT, '.venv', 'Scripts', 'python.exe')

// ── Python 运行环境 ──────────────────────────

/**
 * 获取 Python 可执行文件路径
 * 优先级：.bin/python/ (分发) > .venv/ (开发) > 系统 python
 */
export function getPythonPath(): string {
  if (existsSync(DOTBIN_PYTHON)) return DOTBIN_PYTHON
  if (existsSync(VENV_PYTHON)) return VENV_PYTHON
  return 'python'
}

/**
 * 获取脚本路径（libs/ 目录下的 .py 文件）
 */
export function getScriptPath(scriptName: string): string {
  return join(LIBS_DIR, scriptName)
}

// ── Python 进程调用 ──────────────────────────

/** Python 脚本 stdout 标准输出格式（通用） */
export interface PyOutput {
  [key: string]: unknown
  error?: string
}

/**
 * 调用 Python 脚本
 * 通过 stdin 传入 JSON 字符串，stdout 读取 JSON 结果
 *
 * @param scriptPath Python 脚本绝对路径
 * @param input JSON 字符串
 */
export function runPythonScript<T extends PyOutput = PyOutput>(
  scriptPath: string,
  input: string,
): Promise<T> {
  const pythonPath = getPythonPath()

  return new Promise((resolve, reject) => {
    const py = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const done = (result: T) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    py.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    py.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    // stdin 管道错误处理（Python 进程崩溃 / 管道断裂时防止 unhandled error 崩溃）
    py.stdin.on('error', (err) => {
      done({ error: `Python stdin 写入失败: ${err.message}` } as T)
    })

    py.on('error', (err) => {
      done(
        {
          error:
            `Python 启动失败: ${err.message}。` +
            `请确保已运行 start.bat 初始化环境`,
        } as T,
      )
    })

    py.on('close', (code) => {
      if (code !== 0) {
        done({ error: `Python 退出码 ${code}: ${stderr || stdout}` } as T)
        return
      }
      try {
        done(JSON.parse(stdout.trim()) as T)
      } catch {
        done({ error: `Python 输出解析失败: ${stdout.slice(0, 200)}` } as T)
      }
    })

    try {
      py.stdin.write(input)
      py.stdin.end()
    } catch (err) {
      done({ error: `Python stdin 写入异常: ${(err as Error).message}` } as T)
    }
  })
}
