// ─────────────────────────────────────────────
// AdbService — ADB 命令封装
// 职责：封装 adb.exe 的 connect / screencap 等命令
// adb.exe 路径由雷电模拟器安装目录提供（与 ldconsole.exe 同目录）
// ─────────────────────────────────────────────

import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import iconv from 'iconv-lite'
import { logger } from '../../core/logger.js'

/** ADB 命令执行超时（毫秒） */
const ADB_CONNECT_TIMEOUT = 5_000
const ADB_SCREENCAP_TIMEOUT = 10_000
const ADB_SHELL_TIMEOUT = 5_000

export class AdbService {
  /**
   * 根据 ldconsole 路径推导 adb.exe 路径
   * 雷电模拟器安装目录下自带 adb.exe
   */
  resolveAdbPath(ldconsolePath: string): string {
    const dir = ldconsolePath.replace(/[\\/]ldconsole\.exe$/i, '')
    return resolve(dir, 'adb.exe')
  }

  /**
   * 根据实例 index 计算 ADB 端口
   * 雷电模拟器规则：5555 + index * 2
   */
  getAdbPort(index: number): number {
    return 5555 + index * 2
  }

  /**
   * 获取 ADB 目标地址（如 127.0.0.1:5555）
   */
  getTarget(index: number): string {
    return `127.0.0.1:${this.getAdbPort(index)}`
  }

  /**
   * 连接 ADB 设备
   * 返回是否连接成功
   */
  async connect(adbPath: string, target: string): Promise<boolean> {
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
   * 通过 ADB screencap 截取模拟器画面
   * 截屏前会自动 adb connect 目标设备
   * 返回 PNG 二进制 Buffer
   */
  async screencap(ldconsolePath: string, index: number): Promise<Buffer> {
    const adbPath = this.resolveAdbPath(ldconsolePath)
    const target = this.getTarget(index)

    // 截屏前先尝试 connect
    const connected = await this.connect(adbPath, target)
    if (!connected) {
      throw new Error(`ADB 无法连接到 ${target}，请确认模拟器已启动且 ADB 端口正确`)
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
            reject(new Error('screencap 返回数据不是有效的 PNG（可能模拟器未启动或 ADB 未连接）'))
            return
          }
          logger.info('AdbService', `screencap ok: ${buf.length} bytes`)
          resolveP(buf)
        },
      )
    })
  }
}
