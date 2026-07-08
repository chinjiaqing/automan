// ─────────────────────────────────────────────
// TaskActor — 任务 Actor 实现
// 每个任务实例化为一个 TaskActor，独立生命周期
// ─────────────────────────────────────────────

import { ActorBase } from './actor.base.js'
import { sleep } from '@automan/shared/utils/sleep.js'
import type { TaskConfig } from '@automan/shared/types.js'
import { logger } from '../../core/logger.js'

export class TaskActor extends ActorBase {
  private readonly taskConfig: TaskConfig

  constructor(taskConfig: TaskConfig) {
    super(taskConfig.taskId, `Task:${taskConfig.taskType}`)
    this.taskConfig = taskConfig
  }

  override async start(): Promise<void> {
    await super.start()
    this.sendLog('info', `task [${this.taskConfig.taskType}] started`)
    // 启动异步任务执行循环（不阻塞调用方）
    void this.run()
  }

  override async stop(): Promise<void> {
    this.sendLog('info', `task [${this.taskConfig.taskType}] stopping...`)
    await super.stop()
  }

  async receive(msg: unknown): Promise<void> {
    logger.debug(this.module, `actor ${this.id} received:`, msg)
    this.sendLog('debug', `received message: ${JSON.stringify(msg)}`)
  }

  /** 获取任务配置 */
  getConfig(): TaskConfig {
    return this.taskConfig
  }

  // ── 私有方法 ─────────────────────────────

  /**
   * 任务执行主循环
   * 使用 await sleep() 避免阻塞事件循环
   */
  private async run(): Promise<void> {
    try {
      let tick = 0
      while (this.isRunning()) {
        tick++
        this.sendLog('debug', `tick #${tick} — task running`)
        await sleep(1000)
      }
      this.sendLog('info', `task completed after ${tick} ticks`)
    } catch (err) {
      this.sendLog('error', `task failed: ${String(err)}`)
      logger.error(this.module, `actor ${this.id} error:`, err)
    }
  }
}
