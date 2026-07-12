// ─────────────────────────────────────────────
// DeviceSession — 设备级会话管理
// 职责：管理单个模拟器实例的就绪检测、日志发送
// 多个工作流共享同一 DeviceSession，设备检测只执行一次
// ─────────────────────────────────────────────

import { AdbService } from '../device/adb.service.js'
import { LDPlayerService } from '../device/ldplayer.service.js'
import { eventBus, EventBusEvent, type DeviceLogEvent } from '../../core/event-bus.js'
import { logger } from '../../core/logger.js'
import { config } from '../../config.js'
import { sleep } from '@automan/shared/utils/sleep.js'

/** 模拟器启动最大等待时间（毫秒） */
const LAUNCH_TIMEOUT = 60_000
/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 3_000
/** 新启动后系统初始化等待时间（毫秒） */
const SYSTEM_INIT_WAIT = 10_000
/** 目标 DPI */
const TARGET_DPI = 240

export interface DeviceSessionConfig {
  deviceId: string
  deviceName: string
  ldconsolePath: string
  instanceIndex: number
}

export class DeviceSession {
  readonly deviceId: string
  readonly deviceName: string

  private readonly ldconsolePath: string
  private readonly instanceIndex: number
  private readonly adbService = new AdbService()
  private readonly ldplayer = new LDPlayerService()

  /** 就绪检测 Promise，多个工作流共享同一次检测 */
  private _readyPromise: Promise<void> | null = null

  constructor(cfg: DeviceSessionConfig) {
    this.deviceId = cfg.deviceId
    this.deviceName = cfg.deviceName
    this.ldconsolePath = cfg.ldconsolePath
    this.instanceIndex = cfg.instanceIndex
  }

  /**
   * 确保设备就绪（幂等）
   * 首次调用触发完整检测流程，后续调用复用同一 Promise
   * 检测失败后再次调用会重新触发检测
   */
  ensureReady(): Promise<void> {
    if (!this._readyPromise) {
      this._readyPromise = this._doEnsureReady().catch((err) => {
        // 检测失败时清空 Promise，允许下次重试
        this._readyPromise = null
        throw err
      })
    }
    return this._readyPromise
  }

  /** 销毁会话，清理资源 */
  destroy(): void {
    this._readyPromise = null
    logger.info('DeviceSession', `[${this.deviceName}] session destroyed`)
  }

  // ── 私有方法 ─────────────────────────────────

  /** 执行设备就绪检测流程 */
  private async _doEnsureReady(): Promise<void> {
    const adbPath = this.adbService.resolveAdbPath(this.ldconsolePath)
    const target = this.adbService.getTarget(this.instanceIndex)

    // ── Step 1: ADB 在线检测 ─────────────────────────────────
    this.sendLog('info', `正在检测模拟器状态...`)
    let online = await this.adbService.connect(adbPath, target)

    if (!online) {
      this.sendLog('warn', `模拟器未运行，尝试启动...`)

      await this.ldplayer.launch(this.ldconsolePath, this.instanceIndex)

      const deadline = Date.now() + LAUNCH_TIMEOUT
      let remaining: number

      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL)
        remaining = Math.ceil((deadline - Date.now()) / 1000)
        this.sendLog('info', `等待模拟器上线... (剩余 ${Math.max(remaining, 0)}s)`)
        online = await this.adbService.connect(adbPath, target)
        if (online) break
      }

      if (!online) {
        const errMsg = `模拟器启动超时（${LAUNCH_TIMEOUT / 1000}秒），设备: ${this.deviceName}，本次任务已停止`
        this.sendLog('error', errMsg)
        throw new Error(errMsg)
      }

      this.sendLog('info', `模拟器已上线 ✓`)

      // ── 新启动后强制等待系统初始化 ────────────────────
      const initSeconds = SYSTEM_INIT_WAIT / 1000
      this.sendLog('info', `模拟器新启动，等待系统初始化 (${initSeconds}s)...`)
      // 每秒输出一次倒计时
      for (let i = initSeconds; i > 0; i--) {
        await sleep(1000)
        if (i > 1) {
          this.sendLog('info', `系统初始化中... (${i - 1}s)`)
        }
      }
      this.sendLog('info', `系统初始化完成 ✓`)
    } else {
      this.sendLog('info', `模拟器已在线 ✓`)
    }

    // ── Step 2: 分辨率检测 + 自动校准 ────────────────────────
    const expectedW = config.resolution.width  // 1280
    const expectedH = config.resolution.height // 720

    const size = await this.adbService.getScreenSize(adbPath, target)
    if (!size) {
      this.sendLog('warn', `无法获取分辨率，跳过校准`)
      return
    }

    this.sendLog('info', `检测分辨率: ${size.width}x${size.height}`)

    // 允许横屏 (1280x720) 或竖屏 (720x1280)
    const isLandscape = size.width === expectedW && size.height === expectedH
    const isPortrait = size.width === expectedH && size.height === expectedW

    if (!isLandscape && !isPortrait) {
      this.sendLog('warn', `分辨率不符: 当前 ${size.width}x${size.height}，修正为 ${expectedW}x${expectedH}`)
      await this.adbService.setScreenSize(adbPath, target, expectedW, expectedH)
      await this.adbService.setDensity(adbPath, target, TARGET_DPI)
      this.sendLog('info', `分辨率已修正为 ${expectedW}x${expectedH}，DPI=${TARGET_DPI}`)
    } else {
      this.sendLog('info', `分辨率符合标准 ✓`)
    }
  }

  /** 发送设备级日志（通过 EventBus 广播到前端） */
  private sendLog(level: 'info' | 'warn' | 'error', message: string): void {
    const event: DeviceLogEvent = {
      deviceId: this.deviceId,
      level,
      message: `[${this.deviceName}] ${message}`,
      timestamp: Date.now(),
    }
    eventBus.emit(EventBusEvent.DEVICE_LOG, event)
    // 同步输出服务端控制台日志
    const logFn = level === 'error' ? logger.error : level === 'warn' ? logger.warn : logger.info
    logFn('DeviceSession', `[${this.deviceName}] ${message}`)
  }
}
