// ─────────────────────────────────────────────
// TaskService — 任务服务层
// 职责：对外暴露任务 CRUD 接口，内部调用 ActorManager
// ─────────────────────────────────────────────

import type { TaskConfig, TaskInfo } from '@automan/shared/types.js'
import { TaskState } from '@automan/shared/types.js'
import type { ActorManager } from '../actor/actor.manager.js'
import { logger } from '../../core/logger.js'

export class TaskService {
  private tasks = new Map<string, TaskInfo>()

  constructor(private readonly actorManager: ActorManager) {}

  /** 创建并启动任务 */
  async createTask(config: TaskConfig): Promise<TaskInfo> {
    if (this.tasks.has(config.taskId)) {
      throw new Error(`Task ${config.taskId} already exists`)
    }

    const actor = await this.actorManager.createTaskActor(config)

    const taskInfo: TaskInfo = {
      taskId: config.taskId,
      taskType: config.taskType,
      state: TaskState.RUNNING,
      actorId: actor.id,
      deviceId: config.deviceId,
      createdAt: Date.now(),
    }

    this.tasks.set(config.taskId, taskInfo)
    logger.info('TaskService', `task created: ${config.taskId} (${config.taskType})`)
    return taskInfo
  }

  /** 停止任务 */
  async stopTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    await this.actorManager.destroyActor(taskId)
    task.state = TaskState.STOPPED
    logger.info('TaskService', `task stopped: ${taskId}`)
  }

  /** 获取任务详情 */
  getTask(taskId: string): TaskInfo | undefined {
    return this.tasks.get(taskId)
  }

  /** 列出所有任务 */
  listTasks(): TaskInfo[] {
    return [...this.tasks.values()]
  }

  /** 删除任务记录 */
  async removeTask(taskId: string): Promise<void> {
    await this.actorManager.destroyActor(taskId)
    this.tasks.delete(taskId)
  }
}
