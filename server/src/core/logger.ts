// ─────────────────────────────────────────────
// 统一日志封装
// 模块级 logger，Actor / 独立模块使用
// Fastify 路由内部优先使用 app.log（pino）
// ─────────────────────────────────────────────

import { EventEmitter } from 'node:events'

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
}

/**
 * 全局日志事件发射器
 * Actor 可通过监听此对象，将日志转发到 WS / 文件 / 外部系统
 */
export const logEvents = new EventEmitter()

let currentLevel: LogLevel = LogLevel.DEBUG

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel]
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

export const logger = {
  debug(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog(LogLevel.DEBUG)) return
    const ts = formatTimestamp()
    console.debug(`[${ts}] [DEBUG] [${module}]`, message, ...args)
    logEvents.emit('log', { level: LogLevel.DEBUG, module, message, args, timestamp: Date.now() })
  },

  info(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog(LogLevel.INFO)) return
    const ts = formatTimestamp()
    console.info(`[${ts}] [INFO]  [${module}]`, message, ...args)
    logEvents.emit('log', { level: LogLevel.INFO, module, message, args, timestamp: Date.now() })
  },

  warn(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog(LogLevel.WARN)) return
    const ts = formatTimestamp()
    console.warn(`[${ts}] [WARN]  [${module}]`, message, ...args)
    logEvents.emit('log', { level: LogLevel.WARN, module, message, args, timestamp: Date.now() })
  },

  error(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog(LogLevel.ERROR)) return
    const ts = formatTimestamp()
    console.error(`[${ts}] [ERROR] [${module}]`, message, ...args)
    logEvents.emit('log', { level: LogLevel.ERROR, module, message, args, timestamp: Date.now() })
  },
}
