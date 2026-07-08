/**
 * 异步等待指定毫秒数
 * @param ms - 等待毫秒数，默认 1000ms
 */
export function sleep(ms: number = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
