// ─────────────────────────────────────────────
// DeviceSession — 设备级会话管理
// 职责：管理单个设备的 ADB 连接、分辨率获取、缩放因子计算
// 多个工作流共享同一 DeviceSession，设备检测只执行一次
// ─────────────────────────────────────────────

import { AdbService } from '../device/adb.service.js'
import { computeScaleFactor, type ScaleFactor } from '../device/coordinate.js'
import { eventBus, EventBusEvent, type DeviceLogEvent } from '../../core/event-bus.js'
import { logger } from '../../core/logger.js'
import { config } from '../../config.js'

export interface DeviceSessionConfig {
  deviceId: string
  deviceName: string
  adbPath: string
  adbTarget: string
}

export class DeviceSession {
  readonly deviceId: string
  readonly deviceName: string

  private readonly adbPath: string
  private readonly adbTarget: string
  private readonly adbService = new AdbService()

  /** 就绪检测 Promise，多个工作流共享同一检测 */
  private _readyPromise: Promise<void> | null = null
  private _scaleFactor: ScaleFactor | null = null

  constructor(cfg: DeviceSessionConfig) {
    this.deviceId = cfg.deviceId
    this.deviceName = cfg.deviceName
    this.adbPath = cfg.adbPath
    this.adbTarget = cfg.adbTarget
  }

  /**
   * 确保设备就绪（幂等）
   * 首次调用触发完整检测流程，后续调用复用同一 Promise
   * 检测失败后再次调用会重新触发检测
   */
  ensureReady(): Promise<void> {
    if (!this._readyPromise) {
      this._readyPromise = this._doEnsureReady().catch((err) => {
        this._readyPromise = null
        throw err
      })
    }
    return this._readyPromise
  }

  /** 获取缩放因子（ensureReady 后可用） */
  getScaleFactor(): ScaleFactor {
    if (!this._scaleFactor) {
      throw new Error(`[${this.deviceName}] 设备未就绪，请先调用 ensureReady()`)
    }
    return this._scaleFactor
  }

  /** 获取 ADB 路径 */
  getAdbPath(): string { return this.adbPath }

  /** 获取 ADB 目标地址 */
  getAdbTarget(): string { return this.adbTarget }

  /** 销毁会话，清理资源 */
  destroy(): void {
    this._readyPromise = null
    this._scaleFactor = null
    logger.info('DeviceSession', `[${this.deviceName}] session destroyed`)
  }

  // ── 私有方法 ─────────────────────────────────

  /** 执行设备就绪检测流程 */
  private async _doEnsureReady(): Promise<void> {
    // Step 1: ADB 连接
    this.sendLog('info', `正在连接 ADB ${this.adbTarget}...`)
    const online = await this.adbService.connect(this.adbPath, this.adbTarget)
    if (!online) {
      const errMsg = `无法连接 ADB 设备 ${this.adbTarget}，请确认设备在线且 USB 调试已开启`
      this.sendLog('error', errMsg)
      throw new Error(errMsg)
    }
    this.sendLog('info', `ADB 已连接 ✓`)

    // Step 2: 获取分辨率 + 计算缩放比
    const size = await this.adbService.getScreenSize(this.adbPath, this.adbTarget)
    if (!size) {
      this.sendLog('warn', `无法获取分辨率，使用默认缩放（标准分辨率）`)
      this._scaleFactor = computeScaleFactor(config.resolution.width, config.resolution.height)
      return
    }

    this.sendLog('info', `设备分辨率: ${size.width}x${size.height}`)
    this._scaleFactor = computeScaleFactor(size.width, size.height)
    this.sendLog('info', `标准空间: ${this._scaleFactor.standardWidth}x${this._scaleFactor.standardHeight}`)
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
    const logFn = level === 'error' ? logger.error : level === 'warn' ? logger.warn : logger.info
    logFn('DeviceSession', `[${this.deviceName}] ${message}`)
  }
}
