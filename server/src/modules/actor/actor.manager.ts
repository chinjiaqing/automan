// ─────────────────────────────────────────────
// ActorManager — Actor 调度中心
// 职责：创建 / 销毁 / 路由 Actor
// ─────────────────────────────────────────────

import type { TaskConfig } from '@automan/shared/types.js'
import { TaskActor } from './task.actor.js'
import { ActorBase } from './actor.base.js'
import { logger } from '../../core/logger.js'

export class ActorManager {
  private actors = new Map<string, ActorBase>()

  /** 创建并注册一个 TaskActor */
  async createTaskActor(config: TaskConfig): Promise<TaskActor> {
    if (this.actors.has(config.taskId)) {
      throw new Error(`Actor ${config.taskId} already exists`)
    }

    const actor = new TaskActor(config)
    this.actors.set(config.taskId, actor)
    logger.info('ActorManager', `created actor: ${config.taskId} (total: ${this.actors.size})`)

    await actor.start()
    return actor
  }

  /** 销毁指定 Actor */
  async destroyActor(actorId: string): Promise<void> {
    const actor = this.actors.get(actorId)
    if (!actor) return

    await actor.stop()
    this.actors.delete(actorId)
    logger.info('ActorManager', `destroyed actor: ${actorId} (total: ${this.actors.size})`)
  }

  /** 销毁所有 Actor */
  async destroyAll(): Promise<void> {
    const ids = [...this.actors.keys()]
    for (const id of ids) {
      await this.destroyActor(id)
    }
    logger.info('ActorManager', 'all actors destroyed')
  }

  /** 获取指定 Actor */
  getActor(actorId: string): ActorBase | undefined {
    return this.actors.get(actorId)
  }

  /** 获取所有 Actor 实例 */
  getAllActors(): ActorBase[] {
    return [...this.actors.values()]
  }

  /** 获取当前 Actor 数量 */
  getActorCount(): number {
    return this.actors.size
  }
}
