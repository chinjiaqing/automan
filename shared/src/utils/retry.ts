import { sleep } from './sleep.js'

export interface RetryOptions {
  /** 最大重试次数，默认 3 */
  maxRetries?: number
  /** 每次重试间隔（ms），默认 1000 */
  delay?: number
  /** 是否在失败时打印日志，默认 true */
  logErrors?: boolean
}

/**
 * 带重试的异步函数执行器
 * @param fn - 要执行的异步函数
 * @param options - 重试配置
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, delay = 1000, logErrors = true } = options

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (logErrors) {
        console.warn(`[retry] attempt ${attempt}/${maxRetries + 1} failed:`, lastError.message)
      }
      if (attempt <= maxRetries) {
        await sleep(delay)
      }
    }
  }

  throw lastError
}
