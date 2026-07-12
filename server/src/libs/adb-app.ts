// ─────────────────────────────────────────────
// adb-app — ADB 应用控制封装
//
// 提供启动、关闭、状态检测能力，
// 底层通过 adb shell monkey / am / pidof 实现。
// ─────────────────────────────────────────────

import { execFile } from 'node:child_process'
import { logger } from '../core/logger.js'

/** ADB 应用命令超时（毫秒） */
const ADB_APP_TIMEOUT = 10_000

/**
 * 启动应用
 *
 * 启动前先通过 pidof 检测是否已在运行，已运行则跳过。
 * 使用 monkey 命令启动，简单可靠。
 *
 * @example
 * ```ts
 * await adbLaunchApp(adbPath, '127.0.0.1:5555', 'com.example.app')
 * ```
 */
export async function adbLaunchApp(
  adbPath: string,
  target: string,
  packageName: string,
): Promise<void> {
  // 先检测是否已在运行，已运行则跳过
  const alreadyRunning = await adbIsAppRunning(adbPath, target, packageName)
  if (alreadyRunning) {
    logger.info('adbApp', `${packageName} already running on ${target}, skip launch`)
    return
  }

  logger.info('adbApp', `launch ${packageName} on ${target}`)

  return new Promise((resolve, reject) => {
    execFile(
      adbPath,
      ['-s', target, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'],
      { timeout: ADB_APP_TIMEOUT, windowsHide: true, encoding: 'buffer' },
      (err, stdoutBuf) => {
        if (err) {
          logger.error('adbApp', `launch failed: ${err.message}`)
          reject(new Error(`启动应用失败: ${err.message}`))
          return
        }
        const output = Buffer.from(stdoutBuf).toString('utf-8').trim()
        if (output.includes('Error') || output.includes('Exception')) {
          logger.error('adbApp', `launch error: ${output}`)
          reject(new Error(`启动应用失败: ${output}`))
          return
        }
        logger.info('adbApp', `launched: ${packageName}`)
        resolve()
      },
    )
  })
}

/**
 * 关闭应用
 *
 * 通过 adb shell am force-stop 强制停止应用。
 *
 * @example
 * ```ts
 * await adbKillApp(adbPath, '127.0.0.1:5555', 'com.example.app')
 * ```
 */
export async function adbKillApp(
  adbPath: string,
  target: string,
  packageName: string,
): Promise<void> {
  logger.info('adbApp', `kill ${packageName} on ${target}`)

  return new Promise((resolve, reject) => {
    execFile(
      adbPath,
      ['-s', target, 'shell', 'am', 'force-stop', packageName],
      { timeout: ADB_APP_TIMEOUT, windowsHide: true, encoding: 'buffer' },
      (err) => {
        if (err) {
          logger.error('adbApp', `kill failed: ${err.message}`)
          reject(new Error(`关闭应用失败: ${err.message}`))
          return
        }
        logger.info('adbApp', `killed: ${packageName}`)
        resolve()
      },
    )
  })
}

/**
 * 检测应用是否正在运行
 *
 * 通过 adb shell pidof 查询进程 ID，有返回值表示运行中。
 *
 * @example
 * ```ts
 * const running = await adbIsAppRunning(adbPath, '127.0.0.1:5555', 'com.example.app')
 * // => true | false
 * ```
 */
export async function adbIsAppRunning(
  adbPath: string,
  target: string,
  packageName: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      adbPath,
      ['-s', target, 'shell', 'pidof', packageName],
      { timeout: ADB_APP_TIMEOUT, windowsHide: true, encoding: 'buffer' },
      (err, stdoutBuf) => {
        if (err) {
          // pidof 在进程不存在时返回非零退出码
          resolve(false)
          return
        }
        const output = Buffer.from(stdoutBuf).toString('utf-8').trim()
        const running = output.length > 0
        logger.info('adbApp', `${packageName} running=${running} on ${target}`)
        resolve(running)
      },
    )
  })
}
