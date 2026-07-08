// ─────────────────────────────────────────────
// LDPlayerService — 雷电模拟器控制层
// 封装 ldconsole.exe 命令，提供启动/关闭/重启/状态查询/应用控制
// ldconsolePath 由用户通过 API 传入，不自动探测
// ─────────────────────────────────────────────

import { execFile } from 'node:child_process'
import iconv from 'iconv-lite'
import type { LDInstanceInfo } from '@automan/shared/types.js'
import { logger } from '../../core/logger.js'

/** ldconsole 命令执行超时（毫秒） */
const EXEC_TIMEOUT = 15_000

export interface LDConsoleResult {
  stdout: string
  stderr: string
}

export class LDPlayerService {
  /**
   * 执行 ldconsole 命令
   * ldconsole 输出为 GBK 编码，需用 iconv-lite 解码
   */
  private async exec(
    ldconsolePath: string,
    args: string[],
  ): Promise<LDConsoleResult> {
    logger.info('LDPlayer', `exec: ${ldconsolePath} ${args.join(' ')}`)
    return new Promise((resolve, reject) => {
      execFile(
        ldconsolePath,
        args,
        { timeout: EXEC_TIMEOUT, windowsHide: true, encoding: 'buffer' },
        (err, stdoutBuf, stderrBuf) => {
          if (err) {
            logger.error('LDPlayer', `exec failed: ${err.message}`)
            reject(new Error(`ldconsole 执行失败: ${err.message}`))
            return
          }
          const stdout = iconv.decode(Buffer.from(stdoutBuf), 'gbk').trim()
          const stderr = iconv.decode(Buffer.from(stderrBuf), 'gbk').trim()
          resolve({ stdout, stderr })
        },
      )
    })
  }

  /** 验证 ldconsole 路径是否可用 */
  async validatePath(ldconsolePath: string): Promise<boolean> {
    try {
      await this.exec(ldconsolePath, ['list2'])
      return true
    } catch {
      return false
    }
  }

  // ── 模拟器实例控制 ─────────────────────────

  /** 启动模拟器实例 */
  async launch(ldconsolePath: string, index: number): Promise<void> {
    await this.exec(ldconsolePath, ['launch', '--index', String(index)])
    logger.info('LDPlayer', `instance ${index} launched`)
  }

  /** 关闭模拟器实例 */
  async quit(ldconsolePath: string, index: number): Promise<void> {
    await this.exec(ldconsolePath, ['quit', '--index', String(index)])
    logger.info('LDPlayer', `instance ${index} quit`)
  }

  /** 重启模拟器实例 */
  async reboot(ldconsolePath: string, index: number): Promise<void> {
    await this.exec(ldconsolePath, ['reboot', '--index', String(index)])
    logger.info('LDPlayer', `instance ${index} rebooted`)
  }

  // ── 实例查询 ───────────────────────────────

  /**
   * 获取解析后的实例列表
   * list2 格式：index,name,top_handle,box_handle,是否运行,pid
   */
  async listInstancesParsed(ldconsolePath: string): Promise<LDInstanceInfo[]> {
    const result = await this.exec(ldconsolePath, ['list2'])
    return result.stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(',')
        return {
          index: parseInt(parts[0]?.trim() ?? '0', 10),
          name: parts[1]?.trim() ?? '',
          topHandle: parseInt(parts[2]?.trim() ?? '0', 10),
          boxHandle: parseInt(parts[3]?.trim() ?? '0', 10),
          running: parts[4]?.trim() === '1',
          pid: parseInt(parts[5]?.trim() ?? '0', 10),
        }
      })
  }

  /** 判断指定实例是否正在运行（复用 listInstancesParsed） */
  async isRunning(ldconsolePath: string, index: number): Promise<boolean> {
    const instances = await this.listInstancesParsed(ldconsolePath)
    return instances.find((i) => i.index === index)?.running ?? false
  }

  // ── 应用控制 ───────────────────────────────

  /** 启动应用 */
  async runApp(ldconsolePath: string, index: number, packageName: string): Promise<void> {
    await this.exec(ldconsolePath, ['runapp', '--index', String(index), '--packagename', packageName])
    logger.info('LDPlayer', `app started: ${packageName} on instance ${index}`)
  }

  /** 关闭应用 */
  async killApp(ldconsolePath: string, index: number, packageName: string): Promise<void> {
    await this.exec(ldconsolePath, ['killapp', '--index', String(index), '--packagename', packageName])
    logger.info('LDPlayer', `app killed: ${packageName} on instance ${index}`)
  }
}
