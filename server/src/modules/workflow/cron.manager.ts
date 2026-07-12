// ─────────────────────────────────────────────
// CronManager — 动态 cron 任务管理器
// 职责：管理工作流定时触发的 cron 注册/销毁/缓存
// ─────────────────────────────────────────────

import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'
import type { ScheduleTime } from '@automan/shared/types.js'
import { logger } from '../../core/logger.js'

export class CronManager {
  /** 缓存: compositeKey → ScheduledTask[] */
  private jobs = new Map<string, ScheduledTask[]>()

  /** 生成 compositeKey */
  private key(deviceId: string, workflowId: string): string {
    return `${deviceId}:${workflowId}`
  }

  /**
   * 注册 cron 任务
   * 先销毁旧 job 防重复，为每个 scheduleTime 创建独立 CronJob
   * @param callback cron 触发时的回调（通常是 actor.markPending）
   */
  register(deviceId: string, workflowId: string, times: ScheduleTime[], callback: () => void): void {
    const k = this.key(deviceId, workflowId)

    // 1. 防重复：先清旧的
    this.unregister(deviceId, workflowId)

    if (times.length === 0) {
      logger.warn('CronManager', `register: no schedule times for ${k}`)
      return
    }

    // 2. 为每个时间点创建 CronJob
    const newJobs: ScheduledTask[] = times.map((t) => {
      const expr = `${t.minute} ${t.hour} * * *` // 每天 HH:MM
      const job = cron.schedule(expr, () => {
        logger.info('CronManager', `cron fired: ${k} at ${t.hour}:${String(t.minute).padStart(2, '0')}`)
        callback()
      })
      logger.info('CronManager', `registered: ${k} → ${expr}`)
      return job
    })

    this.jobs.set(k, newJobs)
  }

  /**
   * 注销 cron 任务
   */
  unregister(deviceId: string, workflowId: string): void {
    const k = this.key(deviceId, workflowId)
    const existing = this.jobs.get(k)
    if (existing) {
      for (const job of existing) {
        job.stop()
      }
      this.jobs.delete(k)
      logger.info('CronManager', `unregistered: ${k}`)
    }
  }

  /**
   * 注销所有 cron 任务（服务关闭时调用）
   */
  unregisterAll(): void {
    for (const [k, jobs] of this.jobs) {
      for (const job of jobs) {
        job.stop()
      }
      logger.info('CronManager', `unregistered: ${k}`)
    }
    this.jobs.clear()
  }
}
