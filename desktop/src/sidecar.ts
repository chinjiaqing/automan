// ─────────────────────────────────────────────
// sidecar — server 子进程全生命周期管理
//
// 职责：端口探测（含陈旧 sidecar 指纹清理）、spawn、健康轮询、
//       日志落盘轮转、优雅关闭（stdin 通道）、意外退出退避重启
// ─────────────────────────────────────────────

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  type WriteStream,
} from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import {
  CONFIG_PATH,
  DATA_DIR,
  LOGS_DIR,
  MIGRATIONS_DIR,
  NODE_BIN,
  PYTHON_PATH,
  SERVER_DIR,
  SERVER_ENTRY,
  WEB_DIST,
} from './paths.js'
import { readSettings, writeSettings } from './settings.js'

export interface SidecarInfo {
  port: number
}

interface HealthPayload {
  app?: string
  fingerprint?: string
  pid?: number
}

const HEALTH_RETRIES = 50 // × 200ms = 10s
const STOP_TIMEOUT_MS = 5_000
const MAX_RESTARTS = 3
const MAX_LOG_SIZE = 5 * 1024 * 1024

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 与 server/src/app.ts 相同的指纹算法（sha256("automan:" + 数据目录) 前 16 位） */
export function computeFingerprint(): string {
  return createHash('sha256').update(`automan:${DATA_DIR}`).digest('hex').slice(0, 16)
}

async function fetchHealth(port: number): Promise<HealthPayload | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return null
    return (await res.json()) as HealthPayload
  } catch {
    return null
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolveFree) => {
    const srv = createServer()
    srv.once('error', () => resolveFree(false))
    srv.listen({ host: '127.0.0.1', port }, () => srv.close(() => resolveFree(true)))
  })
}

/** 杀整棵进程树（sidecar 下面挂着 python worker 等孙进程） */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  } else {
    // spawn 时 detached=true，sidecar 是进程组组长，负号 pid 团灭进程组
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* 进程已不存在 */
      }
    }
  }
}

/**
 * 端口决策：空闲即用；被占则查 /health——
 * 指纹匹配 = 上次崩溃残留的陈旧 sidecar（同一数据目录），杀掉复用端口，
 * 防止双 server 操作同一 DB / 同一批模拟器；不匹配 = 他人端口，递增另找。
 */
async function resolvePort(preferred: number, fingerprint: string): Promise<number> {
  let port = preferred
  for (let i = 0; i < 20 && port <= 65535; i++, port++) {
    if (await isPortFree(port)) return port
    const health = await fetchHealth(port)
    if (health?.app === 'automan' && health.fingerprint === fingerprint && health.pid) {
      killTree(health.pid)
      for (let w = 0; w < 15; w++) {
        await sleep(200)
        if (await isPortFree(port)) return port
      }
    }
  }
  throw new Error(`从 ${preferred} 起未找到可用端口`)
}

function rotateLogs(logFile: string): void {
  try {
    if (existsSync(logFile) && statSync(logFile).size > MAX_LOG_SIZE) {
      rmSync(`${logFile}.2`, { force: true })
      if (existsSync(`${logFile}.1`)) renameSync(`${logFile}.1`, `${logFile}.2`)
      renameSync(logFile, `${logFile}.1`)
    }
  } catch {
    /* 轮转失败不阻塞启动 */
  }
}

/** 启动前廉价备份 DB（工作流是用户资产；优雅关闭时 WAL 已 checkpoint） */
function backupDatabase(): void {
  const db = join(DATA_DIR, 'automan.db')
  try {
    if (existsSync(db)) copyFileSync(db, `${db}.bak`)
  } catch {
    /* 备份失败不阻塞启动 */
  }
}

export class Sidecar {
  readonly fingerprint = computeFingerprint()
  port = 0

  private child: ChildProcess | null = null
  private log: WriteStream | null = null
  private stopping = false
  private restarts = 0

  /** 意外退出且重启次数耗尽（main 弹错误框并退出） */
  onFatal: ((message: string) => void) | null = null
  /** 意外退出后自动重启成功（main 刷新窗口 URL，端口可能变化） */
  onRestarted: ((info: SidecarInfo) => void) | null = null

  async start(): Promise<SidecarInfo> {
    const settings = readSettings()
    this.port = await resolvePort(settings.lastPort || 3000, this.fingerprint)

    mkdirSync(DATA_DIR, { recursive: true })
    mkdirSync(LOGS_DIR, { recursive: true })
    backupDatabase()

    const logFile = join(LOGS_DIR, 'server.log')
    rotateLogs(logFile)
    this.log = createWriteStream(logFile, { flags: 'a' })
    this.log.write(`\n──── sidecar start ${new Date().toISOString()} port=${this.port} ────\n`)

    this.child = spawn(NODE_BIN, [SERVER_ENTRY], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        AUTOMAN_SIDECAR: '1',
        HOST: settings.lanAccess ? '0.0.0.0' : '127.0.0.1',
        PORT: String(this.port),
        AUTOMAN_DATA_DIR: DATA_DIR,
        AUTOMAN_WEB_DIST: WEB_DIST,
        AUTOMAN_MIGRATIONS_DIR: MIGRATIONS_DIR,
        AUTOMAN_CONFIG_PATH: CONFIG_PATH,
        // Windows 版内置 Python；mac 版无此目录，交给 server 端回退链
        ...(existsSync(PYTHON_PATH) ? { AUTOMAN_PYTHON_PATH: PYTHON_PATH } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      // unix：独立进程组（组长 = sidecar），兜底 kill(-pid) 可团灭 python 等孙进程；
      // 副作用是 Electron 崩溃时 sidecar 存活，由下次启动的指纹清理接管
      detached: process.platform !== 'win32',
    })
    this.child.stdout?.on('data', (chunk: Buffer) => this.log?.write(chunk))
    this.child.stderr?.on('data', (chunk: Buffer) => this.log?.write(chunk))
    this.child.on('exit', (code) => this.handleExit(code))

    await this.waitHealthy()
    writeSettings({ lastPort: this.port })
    this.restarts = 0
    return { port: this.port }
  }

  /** 优雅关闭：关 stdin → server 端 app.close()；超时 killTree 兜底 */
  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    if (!child) return
    const exited = new Promise<void>((r) => child.once('exit', () => r()))
    try {
      child.stdin?.end()
    } catch {
      /* 管道可能已断 */
    }
    const result = await Promise.race([exited.then(() => 'ok' as const), sleep(STOP_TIMEOUT_MS)])
    if (result !== 'ok' && child.pid) {
      killTree(child.pid)
      await Promise.race([exited, sleep(2000)])
    }
    this.log?.end()
    this.child = null
  }

  private async waitHealthy(): Promise<void> {
    for (let i = 0; i < HEALTH_RETRIES; i++) {
      if (!this.child || this.child.exitCode !== null) {
        throw new Error(`服务进程启动即退出，详见日志：${join(LOGS_DIR, 'server.log')}`)
      }
      const health = await fetchHealth(this.port)
      if (health?.app === 'automan' && health.fingerprint === this.fingerprint) return
      await sleep(200)
    }
    throw new Error('服务 10 秒内未就绪')
  }

  private handleExit(code: number | null): void {
    this.log?.write(`──── sidecar exit code=${code} ────\n`)
    this.child = null
    if (this.stopping) return
    if (this.restarts >= MAX_RESTARTS) {
      this.onFatal?.(
        `服务进程连续异常退出（code=${code}）。\n日志：${join(LOGS_DIR, 'server.log')}`,
      )
      return
    }
    const delay = 1000 * 3 ** this.restarts
    this.restarts++
    setTimeout(() => {
      void this.start()
        .then((info) => this.onRestarted?.(info))
        .catch((err: unknown) => this.onFatal?.((err as Error).message))
    }, delay)
  }
}
