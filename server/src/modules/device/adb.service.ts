// ─────────────────────────────────────────────
// AdbService — ADB 命令封装（通用）
// 职责：封装 adb.exe 的 connect / screencap / shell 等命令
// 不区分模拟器或真机，统一通过 adbPath + target 寻址
// ─────────────────────────────────────────────

import { execFile } from 'node:child_process'
import iconv from 'iconv-lite'
import { logger } from '../../core/logger.js'

/** ADB 命令执行超时（毫秒） */
const ADB_CONNECT_TIMEOUT = 5_000
const ADB_SCREENCAP_TIMEOUT = 10_000
const ADB_SHELL_TIMEOUT = 5_000
const ADB_DEVICES_TIMEOUT = 5_000

/** 扫描到的设备条目 */
export interface DiscoveredDevice {
  serial: string        // USB 序列号 或 ip:port
  status: string        // 'device' | 'offline' | 'unauthorized'
  model?: string
  transportType: 'usb' | 'wifi' | 'emulator'
}

export class AdbService {
  /**
   * 连接 ADB 设备
   * USB 设备已在线无需 connect，仅对网络设备执行 adb connect
   * 返回是否连接成功
   */
  async connect(adbPath: string, target: string): Promise<boolean> {
    // 先检查设备是否已经在线（USB 设备无需 connect）
    try {
      const devices = await this.listDevices(adbPath)
      const found = devices.find((d) => d.serial === target && d.status === 'device')
      if (found) {
        logger.info('AdbService', `${target} already connected`)
        return true
      }
    } catch {
      // listDevices 失败则继续尝试 connect
    }

    logger.info('AdbService', `connect ${target}`)
    return new Promise((resolveP) => {
      execFile(
        adbPath,
        ['connect', target],
        { timeout: ADB_CONNECT_TIMEOUT, windowsHide: true, encoding: 'buffer' },
        (err, stdoutBuf) => {
          if (err) {
            logger.error('AdbService', `connect failed: ${err.message}`)
            resolveP(false)
            return
          }
          const output = iconv.decode(Buffer.from(stdoutBuf), 'utf-8').trim()
          const ok = output.includes('connected')
          if (!ok) {
            logger.error('AdbService', `connect output: ${output}`)
          }
          resolveP(ok)
        },
      )
    })
  }

  /**
   * 执行 ADB shell 命令并返回输出
   */
  async shell(adbPath: string, target: string, ...cmd: string[]): Promise<string> {
    const args = ['-s', target, 'shell', ...cmd]
    return new Promise((resolveP, reject) => {
      execFile(
        adbPath,
        args,
        { timeout: ADB_SHELL_TIMEOUT, windowsHide: true, encoding: 'buffer' },
        (err, stdoutBuf) => {
          if (err) {
            reject(new Error(`adb shell ${cmd.join(' ')} failed: ${err.message}`))
            return
          }
          resolveP(iconv.decode(Buffer.from(stdoutBuf), 'utf-8').trim())
        },
      )
    })
  }

  /**
   * 获取设备当前分辨率
   * 返回 { width, height } 或 null（无法获取时）
   */
  async getScreenSize(adbPath: string, target: string): Promise<{ width: number; height: number } | null> {
    try {
      const output = await this.shell(adbPath, target, 'wm', 'size')
      // 输出示例: "Physical size: 1280x720"
      const match = output.match(/(\d+)x(\d+)/)
      if (!match) {
        logger.warn('AdbService', `无法解析 wm size 输出: ${output}`)
        return null
      }
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) }
    } catch (err) {
      logger.error('AdbService', `getScreenSize failed: ${String(err)}`)
      return null
    }
  }

  /**
   * 设置设备分辨率
   * 命令: adb shell wm size {width}x{height}
   */
  async setScreenSize(adbPath: string, target: string, width: number, height: number): Promise<boolean> {
    try {
      await this.shell(adbPath, target, 'wm', 'size', `${width}x${height}`)
      logger.info('AdbService', `setScreenSize: ${width}x${height} on ${target}`)
      return true
    } catch (err) {
      logger.error('AdbService', `setScreenSize failed: ${String(err)}`)
      return false
    }
  }

  /**
   * 设置设备 DPI
   * 命令: adb shell wm density {dpi}
   */
  async setDensity(adbPath: string, target: string, dpi: number): Promise<boolean> {
    try {
      await this.shell(adbPath, target, 'wm', 'density', String(dpi))
      logger.info('AdbService', `setDensity: ${dpi} on ${target}`)
      return true
    } catch (err) {
      logger.error('AdbService', `setDensity failed: ${String(err)}`)
      return false
    }
  }

  /**
   * 通过 ADB screencap 截取设备画面
   * 截屏前会自动 adb connect 目标设备
   * 返回 PNG 二进制 Buffer
   */
  async screencap(adbPath: string, target: string): Promise<Buffer> {
    // 截屏前先尝试 connect
    const connected = await this.connect(adbPath, target)
    if (!connected) {
      throw new Error(`ADB 无法连接到 ${target}，请确认设备在线且 ADB 端口正确`)
    }

    logger.info('AdbService', `screencap: adb -s ${target} exec-out screencap -p`)

    return new Promise((resolveP, reject) => {
      execFile(
        adbPath,
        ['-s', target, 'exec-out', 'screencap', '-p'],
        { timeout: ADB_SCREENCAP_TIMEOUT, maxBuffer: 20 * 1024 * 1024, windowsHide: true, encoding: 'buffer' },
        (err, stdoutBuf) => {
          if (err) {
            logger.error('AdbService', `screencap failed: ${err.message}`)
            reject(new Error(`ADB screencap 失败: ${err.message}`))
            return
          }
          const buf = Buffer.from(stdoutBuf)
          // PNG 文件头校验：前 2 字节为 0x89 0x50
          if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
            reject(new Error('screencap 返回数据不是有效的 PNG（可能设备未启动或 ADB 未连接）'))
            return
          }
          logger.info('AdbService', `screencap ok: ${buf.length} bytes`)
          resolveP(buf)
        },
      )
    })
  }

  /**
   * 扫描已连接的 ADB 设备列表
   * 执行 `adb devices -l`，解析输出
   */
  async listDevices(adbPath: string): Promise<DiscoveredDevice[]> {
    return new Promise((resolveP, reject) => {
      execFile(
        adbPath,
        ['devices', '-l'],
        { timeout: ADB_DEVICES_TIMEOUT, windowsHide: true, encoding: 'buffer' },
        (err, stdoutBuf) => {
          if (err) {
            reject(new Error(`adb devices failed: ${err.message}`))
            return
          }
          const output = iconv.decode(Buffer.from(stdoutBuf), 'utf-8')
          const devices = this.parseDevicesOutput(output)
          resolveP(devices)
        },
      )
    })
  }

  /**
   * 解析 `adb devices -l` 输出
   * 示例行：
   *   ABCDEF123456    device    transport_id:1 product:raven model:Pixel_6_Pro device:raven
   *   192.168.1.5:5555  device    transport_id:2 product:xxx model:Redmi device:xxx
   *   emulator-5554    device    product:xxx model:xxx device:xxx
   */
  private parseDevicesOutput(output: string): DiscoveredDevice[] {
    const result: DiscoveredDevice[] = []
    const lines = output.split('\n').slice(1) // 跳过 "List of devices attached" 标题行

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const parts = trimmed.split(/\s+/)
      if (parts.length < 2) continue

      const rawSerial = parts[0]
      const status = parts[1]

      // 从后续键值对中解析 model
      const kvPairs = parts.slice(2)
      const model = kvPairs.find((p) => p.startsWith('model:'))?.replace('model:', '')

      // 判断设备类型并转换 serial 为可连接地址
      let serial = rawSerial
      let transportType: 'usb' | 'wifi' | 'emulator'

      if (rawSerial.startsWith('emulator-')) {
        // 模拟器：emulator-5554 的 ADB 端口 = 5554 + 1 = 5555
        transportType = 'emulator'
        const consolePort = parseInt(rawSerial.replace('emulator-', ''), 10)
        if (!isNaN(consolePort)) {
          serial = `127.0.0.1:${consolePort + 1}`
        }
      } else if (rawSerial.startsWith('127.0.0.1:')) {
        // 本地网络设备（如雷电模拟器 127.0.0.1:5555）
        transportType = 'emulator'
      } else if (/[:]/.test(rawSerial)) {
        // 远程 WiFi 设备（如 192.168.1.5:5555）
        transportType = 'wifi'
      } else {
        // USB 真机（纯序列号，如 ABCDEF123456）
        transportType = 'usb'
      }

      result.push({ serial, status, model, transportType })
    }

    // 去重：emulator-5554 和 127.0.0.1:5555 可能指向同一设备
    const seen = new Set<string>()
    return result.filter((d) => {
      if (seen.has(d.serial)) return false
      seen.add(d.serial)
      return true
    })
  }
}
