// ─────────────────────────────────────────────
// ScreenshotDispatcher — 每设备截图调度器
// 职责：定时截屏 → 通过 EventBus 分发给订阅者
// ─────────────────────────────────────────────

import sharp from 'sharp'
import { AdbService } from '../device/adb.service.js'
import { eventBus, EventBusEvent } from '../../core/event-bus.js'
import { logger } from '../../core/logger.js'
import { config } from '../../config.js'

/** 截图事件负载 */
export interface ScreenshotEvent {
  deviceId: string
  image: string // data:image/png;base64,...
  width: number       // 压缩后宽度
  height: number      // 压缩后高度
  originalWidth: number   // 原始设备分辨率宽度
  originalHeight: number  // 原始设备分辨率高度
  timestamp: number
}

/** 设备信息（用于截图） */
export interface DeviceScreenshotInfo {
  id: string
  ldconsolePath: string
  instanceIndex: number
}

/** 默认截图间隔（毫秒），从配置文件读取 */
const DEFAULT_INTERVAL = config.screenshot.interval

export class ScreenshotDispatcher {
  private adbService = new AdbService()
  private dispatchers = new Map<string, {
    timer: ReturnType<typeof setInterval>
    device: DeviceScreenshotInfo
    subscribers: number
  }>()

  /** 为设备启动截图调度器（幂等） */
  start(device: DeviceScreenshotInfo, interval = DEFAULT_INTERVAL): void {
    if (this.dispatchers.has(device.id)) {
      const d = this.dispatchers.get(device.id)!
      d.subscribers++
      logger.info('ScreenshotDispatcher', `device ${device.id} subscriber++ (total: ${d.subscribers})`)
      return
    }

    logger.info('ScreenshotDispatcher', `starting for device ${device.id}, interval ${interval}ms`)

    const timer = setInterval(() => {
      void this.captureAndDispatch(device)
    }, interval)

    this.dispatchers.set(device.id, { timer, device, subscribers: 1 })
  }

  /** 减少设备订阅计数，无订阅时停止 */
  stop(deviceId: string): void {
    const d = this.dispatchers.get(deviceId)
    if (!d) return

    d.subscribers--
    logger.info('ScreenshotDispatcher', `device ${deviceId} subscriber-- (total: ${d.subscribers})`)

    if (d.subscribers <= 0) {
      clearInterval(d.timer)
      this.dispatchers.delete(deviceId)
      logger.info('ScreenshotDispatcher', `stopped for device ${deviceId}`)
    }
  }

  /** 停止所有调度器 */
  stopAll(): void {
    for (const [id, d] of this.dispatchers) {
      clearInterval(d.timer)
      logger.info('ScreenshotDispatcher', `stopped for device ${id}`)
    }
    this.dispatchers.clear()
  }

  /** 获取活跃调度器数量 */
  getActiveCount(): number {
    return this.dispatchers.size
  }

  // ── 私有方法 ─────────────────────────────────

  /** 截屏并分发（含压缩） */
  private async captureAndDispatch(device: DeviceScreenshotInfo): Promise<void> {
    try {
      const rawBuf = await this.adbService.screencap(device.ldconsolePath, device.instanceIndex)

      // 获取原始分辨率
      const rawMeta = await sharp(rawBuf).metadata()
      const originalWidth = rawMeta.width ?? 0
      const originalHeight = rawMeta.height ?? 0

      // 强制 resize 到标准分辨率宽度
      const { data, info } = await sharp(rawBuf)
        .resize({ width: config.resolution.width })
        .png({ compressionLevel: 6 })
        .toBuffer({ resolveWithObject: true })

      const base64 = data.toString('base64')
      const image = `data:image/png;base64,${base64}`

      const event: ScreenshotEvent = {
        deviceId: device.id,
        image,
        width: info.width,
        height: info.height,
        originalWidth,
        originalHeight,
        timestamp: Date.now(),
      }

      eventBus.emit(EventBusEvent.SCREENSHOT_READY, event)
    } catch (err) {
      logger.error('ScreenshotDispatcher', `capture failed for device ${device.id}: ${String(err)}`)
    }
  }
}
