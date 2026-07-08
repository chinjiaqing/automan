// ─────────────────────────────────────────────
// DeviceManager — 设备注册与管理
// 职责：维护已绑定设备列表，提供绑定/解绑/控制/截屏接口
// 内部调用 LDPlayerService（ldconsole 命令）+ AdbService（ADB 命令）
// ─────────────────────────────────────────────

import type { DeviceBindRequest, DeviceInfo, LDInstanceInfo } from '@automan/shared/types.js'
import { DeviceState } from '@automan/shared/types.js'
import { LDPlayerService } from './ldplayer.service.js'
import { AdbService } from './adb.service.js'
import { logger } from '../../core/logger.js'

export class DeviceManager {
  private devices = new Map<string, DeviceInfo>()
  private readonly ld = new LDPlayerService()
  private readonly adb = new AdbService()

  // ── 设备注册 / 解绑 ────────────────────────

  /**
   * 绑定一台设备（用户传入 ldconsolePath + instanceIndex）
   * 绑定前会验证 ldconsole 路径是否可用
   */
  async bindDevice(req: DeviceBindRequest): Promise<DeviceInfo> {
    const valid = await this.ld.validatePath(req.ldconsolePath)
    if (!valid) {
      throw new Error(`ldconsole 路径无效或无法执行: ${req.ldconsolePath}`)
    }

    const id = crypto.randomUUID()
    const device: DeviceInfo = {
      id,
      name: req.name,
      ldconsolePath: req.ldconsolePath,
      instanceIndex: req.instanceIndex,
      state: DeviceState.OFFLINE,
      boundAt: Date.now(),
    }

    this.devices.set(id, device)
    logger.info('DeviceManager', `device bound: ${req.name} [index=${req.instanceIndex}]`)

    // 检测实例是否已在运行
    await this.refreshDeviceState(id)
    return device
  }

  /** 解绑设备 */
  unbindDevice(deviceId: string): void {
    const device = this.devices.get(deviceId)
    if (!device) throw new Error(`设备 ${deviceId} 不存在`)
    this.devices.delete(deviceId)
    logger.info('DeviceManager', `device unbound: ${device.name}`)
  }

  // ── 设备控制 ──────────────────────────────

  /** 启动模拟器 */
  async launchDevice(deviceId: string): Promise<void> {
    const device = this.getDeviceOrThrow(deviceId)
    await this.ld.launch(device.ldconsolePath, device.instanceIndex)
    device.state = DeviceState.ONLINE
    logger.info('DeviceManager', `device launched: ${device.name}`)
  }

  /** 关闭模拟器 */
  async quitDevice(deviceId: string): Promise<void> {
    const device = this.getDeviceOrThrow(deviceId)
    await this.ld.quit(device.ldconsolePath, device.instanceIndex)
    device.state = DeviceState.OFFLINE
    logger.info('DeviceManager', `device quit: ${device.name}`)
  }

  /** 重启模拟器 */
  async rebootDevice(deviceId: string): Promise<void> {
    const device = this.getDeviceOrThrow(deviceId)
    await this.ld.reboot(device.ldconsolePath, device.instanceIndex)
    device.state = DeviceState.ONLINE
    logger.info('DeviceManager', `device rebooted: ${device.name}`)
  }

  // ── 查询 ──────────────────────────────────

  /** 列出所有已绑定设备 */
  listDevices(): DeviceInfo[] {
    return [...this.devices.values()]
  }

  /** 获取单个设备 */
  getDevice(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId)
  }

  /** 刷新设备运行状态 */
  async refreshDeviceState(deviceId: string): Promise<DeviceState> {
    const device = this.getDeviceOrThrow(deviceId)
    const running = await this.ld.isRunning(device.ldconsolePath, device.instanceIndex)
    device.state = running ? DeviceState.ONLINE : DeviceState.OFFLINE
    return device.state
  }

  /** 获取模拟器实例列表（解析后） */
  async listInstances(ldconsolePath: string): Promise<LDInstanceInfo[]> {
    return this.ld.listInstancesParsed(ldconsolePath)
  }

  // ── 应用控制 ──────────────────────────────

  /** 启动应用 */
  async startApp(deviceId: string, packageName: string): Promise<void> {
    const device = this.getDeviceOrThrow(deviceId)
    await this.ld.runApp(device.ldconsolePath, device.instanceIndex, packageName)
    logger.info('DeviceManager', `app started: ${packageName} on ${device.name}`)
  }

  /** 关闭应用 */
  async stopApp(deviceId: string, packageName: string): Promise<void> {
    const device = this.getDeviceOrThrow(deviceId)
    await this.ld.killApp(device.ldconsolePath, device.instanceIndex, packageName)
    logger.info('DeviceManager', `app stopped: ${packageName} on ${device.name}`)
  }

  /** 重启应用（先关等 1s 再开） */
  async restartApp(deviceId: string, packageName: string): Promise<void> {
    await this.stopApp(deviceId, packageName)
    await new Promise((r) => setTimeout(r, 1000))
    await this.startApp(deviceId, packageName)
    logger.info('DeviceManager', `app restarted: ${packageName}`)
  }

  // ── 截屏 ─────────────────────────────────

  /**
   * 截取设备当前画面（ADB screencap）
   * 返回 PNG 原始 Buffer，路由层按需转换格式
   */
  async screenshot(deviceId: string): Promise<Buffer> {
    const device = this.getDeviceOrThrow(deviceId)
    const pngBuf = await this.adb.screencap(device.ldconsolePath, device.instanceIndex)
    logger.info('DeviceManager', `screenshot: ${device.name} (${pngBuf.length} bytes)`)
    return pngBuf
  }

  // ── 私有方法 ──────────────────────────────

  private getDeviceOrThrow(deviceId: string): DeviceInfo {
    const device = this.devices.get(deviceId)
    if (!device) throw new Error(`设备 ${deviceId} 不存在`)
    return device
  }
}
