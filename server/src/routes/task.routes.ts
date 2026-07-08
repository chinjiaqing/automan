// ─────────────────────────────────────────────
// 任务路由模块
// 职责：任务 CRUD、启停控制
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import type { TaskService } from '../modules/task/task.service.js'

export async function taskRoutes(app: FastifyInstance, ts: TaskService): Promise<void> {
  // 列出所有任务
  app.get('/api/tasks', async () => {
    return { tasks: ts.listTasks() }
  })

  // 创建任务
  app.post<{ Body: { taskType: string; deviceId?: string; params?: Record<string, unknown> } }>(
    '/api/tasks',
    async (request) => {
      const { taskType, deviceId, params } = request.body
      const task = await ts.createTask({
        taskId: crypto.randomUUID(),
        taskType,
        deviceId,
        params,
      })
      return { task }
    },
  )

  // 停止任务
  app.post<{ Params: { id: string } }>('/api/tasks/:id/stop', async (request) => {
    await ts.stopTask(request.params.id)
    return { taskId: request.params.id, state: 'stopped' }
  })
}
