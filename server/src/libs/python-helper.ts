// ─────────────────────────────────────────────
// python-helper — Python 进程调用封装
//
// 职责：
//   - 获取项目内 .venv Python 路径
//   - spawn Python 脚本 + stdin/stdout JSON 通信
//
// 本文件不包含任何业务逻辑，仅供 Python 调用工具
// ─────────────────────────────────────────────

import { spawn, type ChildProcess } from 'node:child_process'
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
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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

// ── 持久化 Python 工作进程 ──────────────────

interface PendingRequest {
  resolve: (result: PyOutput) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * 持久化 Python 工作进程
 *
 * 进程启动后预加载模型，后续调用直接通过 stdin 发送命令，
 * 消除每次 spawn + 模型加载的开销。
 *
 * 协议：stdin/stdout 各一行一个 JSON 对象
 */
export class PythonWorker {
  private proc: ChildProcess | null = null
  private ready = false
  private readyResolvers: (() => void)[] = []
  private buffer = ''
  private pending: PendingRequest[] = []
  private readonly scriptPath: string

  constructor(scriptName: string) {
    this.scriptPath = getScriptPath(scriptName)
  }

  /** 确保进程已启动且模型已预热 */
  private ensureStarted(): Promise<void> {
    if (this.ready && this.proc && !this.proc.killed) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      this.readyResolvers.push(resolve)

      if (this.proc) return // 已在启动中

      const pythonPath = getPythonPath()
      this.proc = spawn(pythonPath, ['-u', this.scriptPath, '--worker'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })

      let stderrBuf = ''

      this.proc.stdout!.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString()
        this.flushLines()
      })

      this.proc.stderr!.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString()
      })

      this.proc.on('error', (err) => {
        this.killAll(err.message)
      })

      this.proc.on('close', (code) => {
        if (code !== 0 && stderrBuf) {
          this.killAll(`Python worker 退出 (code=${code}): ${stderrBuf.slice(0, 500)}`)
        }
        this.proc = null
        this.ready = false
      })

      this.proc.stdin!.on('error', (err) => {
        this.killAll(`stdin 错误: ${err.message}`)
      })
    })
  }

  /** 解析并分发完整的 JSON 行 */
  private flushLines(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? '' // 保留未完成行

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const data = JSON.parse(trimmed)

        // 就绪信号
        if (data.ready) {
          this.ready = true
          for (const r of this.readyResolvers) r()
          this.readyResolvers = []
          continue
        }

        // 正常响应
        const pending = this.pending.shift()
        if (pending) {
          clearTimeout(pending.timer)
          pending.resolve(data)
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  }

  /** 发送命令并等待结果 */
  async send<T extends PyOutput = PyOutput>(
    command: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<T> {
    await this.ensureStarted()

    return new Promise<T>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.shift()
        resolve({ error: `Python worker 响应超时 (${timeoutMs}ms)` } as T)
      }, timeoutMs)

      this.pending.push({
        resolve: resolve as (result: PyOutput) => void,
        timer,
      })

      try {
        this.proc!.stdin!.write(JSON.stringify(command) + '\n')
      } catch (err) {
        clearTimeout(timer)
        this.pending.pop()
        resolve({ error: `stdin 写入失败: ${(err as Error).message}` } as T)
      }
    })
  }

  /** 终止所有待处理请求并杀进程 */
  private killAll(reason: string): void {
    while (this.pending.length > 0) {
      const p = this.pending.shift()!
      clearTimeout(p.timer)
      p.resolve({ error: reason })
    }
    if (this.proc && !this.proc.killed) {
      this.proc.kill()
    }
    this.proc = null
    this.ready = false
  }
}
