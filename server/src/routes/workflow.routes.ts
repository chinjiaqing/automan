// ─────────────────────────────────────────────
// Workflow 路由模块
// 职责：工作流 CRUD（list / create / get / save / delete）
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { db, workflows, deviceWorkflowChecks } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type {
  CreateWorkflowRequest,
  SaveWorkflowRequest,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  RunWorkflowRequest,
  StopWorkflowRequest,
  BatchRunWorkflowRequest,
  SaveCheckedWorkflowsRequest,
  CheckedWorkflowsSnapshot,
} from '@automan/shared/types.js'
import type { WorkflowService } from '../modules/workflow/service.js'

/** 将 DB Row 转为 Workflow */
function toWorkflow(row: typeof workflows.$inferSelect): Workflow {
  return {
    id: row.id,
    name: row.name,
    deviceId: row.deviceId ?? undefined,
    nodes: JSON.parse(row.nodesJson) as WorkflowNode[],
    edges: JSON.parse(row.edgesJson) as WorkflowEdge[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function workflowRoutes(app: FastifyInstance, workflowService?: WorkflowService): Promise<void> {
  // ── 查询工作流列表 ──────────────────────────
  app.get('/api/workflows', async () => {
    const rows = db.select().from(workflows).orderBy(workflows.createdAt).all()
    return { success: true as const, data: rows.map(toWorkflow) }
  })

  // ── 创建工作流 ──────────────────────────────
  app.post<{ Body: CreateWorkflowRequest }>(
    '/api/workflows',
    async (request, reply) => {
      const { name, deviceId } = request.body
      if (!name) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_PARAMS',
          message: 'name 为必填',
        })
      }

      const now = Date.now()
      const id = crypto.randomUUID()

      // 初始节点：start + end
      const defaultNodes: WorkflowNode[] = [
        { id: 'start_1', type: 'start', label: '开始', position: { x: 250, y: 50 }, config: {} },
        { id: 'end_1', type: 'end', label: '结束', position: { x: 250, y: 400 }, config: {} },
      ]

      db.insert(workflows)
        .values({
          id,
          name,
          deviceId: deviceId ?? null,
          nodesJson: JSON.stringify(defaultNodes),
          edgesJson: '[]',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const row = db.select().from(workflows).where(eq(workflows.id, id)).get()!
      app.log.info(`Workflow created: ${name}`)
      return { success: true as const, data: toWorkflow(row) }
    },
  )

  // ── 获取单个工作流 ─────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/workflows/:id',
    async (request, reply) => {
      const { id } = request.params
      const row = db.select().from(workflows).where(eq(workflows.id, id)).get()
      if (!row) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `工作流 ${id} 不存在`,
        })
      }
      return { success: true as const, data: toWorkflow(row) }
    },
  )

  // ── 保存工作流（nodes + edges + 可选 name）────────────────
  app.post<{ Params: { id: string }; Body: SaveWorkflowRequest }>(
    '/api/workflows/:id/save',
    async (request, reply) => {
      const { id } = request.params
      const { nodes, edges, name } = request.body

      const existing = db.select().from(workflows).where(eq(workflows.id, id)).get()
      if (!existing) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `工作流 ${id} 不存在`,
        })
      }

      const updateData: Record<string, unknown> = {
        nodesJson: JSON.stringify(nodes ?? []),
        edgesJson: JSON.stringify(edges ?? []),
        updatedAt: Date.now(),
      }
      if (name !== undefined) {
        updateData.name = name
      }

      db.update(workflows)
        .set(updateData)
        .where(eq(workflows.id, id))
        .run()

      const row = db.select().from(workflows).where(eq(workflows.id, id)).get()!
      app.log.info(`Workflow saved: ${row.name}`)
      return { success: true as const, data: toWorkflow(row) }
    },
  )

  // ── 删除工作流 ──────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/workflows/:id/delete',
    async (request, reply) => {
      const { id } = request.params
      const existing = db.select().from(workflows).where(eq(workflows.id, id)).get()
      if (!existing) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `工作流 ${id} 不存在`,
        })
      }

      db.delete(workflows).where(eq(workflows.id, id)).run()
      app.log.info(`Workflow deleted: ${existing.name}`)
      return { success: true as const, data: { id } }
    },
  )

  // ── 运行工作流 ──────────────────────────────
  app.post<{ Body: RunWorkflowRequest }>(
    '/api/workflows/run',
    async (request, reply) => {
      if (!workflowService) {
        return reply.status(503).send({ success: false, code: 'NOT_READY', message: 'WorkflowService 未初始化' })
      }
      const { deviceId, workflowId, screenshotInterval } = request.body
      if (!deviceId || !workflowId) {
        return reply.status(400).send({ success: false, code: 'INVALID_PARAMS', message: 'deviceId 和 workflowId 为必填' })
      }
      try {
        const info = await workflowService.startWorkflow(workflowId, deviceId, screenshotInterval)
        return { success: true as const, data: info }
      } catch (err) {
        return reply.status(400).send({ success: false, code: 'RUN_ERROR', message: String(err) })
      }
    },
  )

  // ── 停止工作流 ──────────────────────────────
  app.post<{ Body: StopWorkflowRequest }>(
    '/api/workflows/stop',
    async (request, reply) => {
      if (!workflowService) {
        return reply.status(503).send({ success: false, code: 'NOT_READY', message: 'WorkflowService 未初始化' })
      }
      const { runId } = request.body
      if (!runId) {
        return reply.status(400).send({ success: false, code: 'INVALID_PARAMS', message: 'runId 为必填' })
      }
      try {
        await workflowService.stopWorkflow(runId)
        return { success: true as const, data: { runId } }
      } catch (err) {
        return reply.status(400).send({ success: false, code: 'STOP_ERROR', message: String(err) })
      }
    },
  )

  // ── 查询运行中的工作流 ──────────────────────
  app.get('/api/workflows/running', async () => {
    if (!workflowService) {
      return { success: true as const, data: [] }
    }
    return { success: true as const, data: workflowService.listRuns() }
  })

  // ── 批量启动工作流（设备级） ─────────────────────
  app.post<{ Body: BatchRunWorkflowRequest }>(
    '/api/workflows/run-batch',
    async (request, reply) => {
      if (!workflowService) {
        return reply.status(503).send({ success: false, code: 'NOT_READY', message: 'WorkflowService 未初始化' })
      }
      const { deviceId, workflowIds, screenshotInterval } = request.body
      if (!deviceId || !workflowIds || !Array.isArray(workflowIds) || workflowIds.length === 0) {
        return reply.status(400).send({ success: false, code: 'INVALID_PARAMS', message: 'deviceId 和 workflowIds 为必填' })
      }
      try {
        const result = await workflowService.batchStartWorkflows(deviceId, workflowIds, screenshotInterval)
        return { success: true as const, data: result }
      } catch (err) {
        return reply.status(400).send({ success: false, code: 'RUN_ERROR', message: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  // ── 查询所有设备勾选快照 ─────────────────────
  app.get('/api/workflows/checked', async () => {
    const rows = db.select().from(deviceWorkflowChecks).all()
    const data: CheckedWorkflowsSnapshot[] = rows.map((row) => ({
      deviceId: row.deviceId,
      workflowIds: JSON.parse(row.workflowIds) as string[],
      updatedAt: row.updatedAt,
    }))
    return { success: true as const, data }
  })

  // ── 查询单设备勾选快照 ─────────────────────
  app.get<{ Params: { deviceId: string } }>('/api/workflows/checked/:deviceId', async (request) => {
    const { deviceId } = request.params
    const row = db.select().from(deviceWorkflowChecks).where(eq(deviceWorkflowChecks.deviceId, deviceId)).get()
    if (!row) {
      return { success: true as const, data: { deviceId, workflowIds: [], updatedAt: 0 } as CheckedWorkflowsSnapshot }
    }
    return {
      success: true as const,
      data: {
        deviceId: row.deviceId,
        workflowIds: JSON.parse(row.workflowIds) as string[],
        updatedAt: row.updatedAt,
      } as CheckedWorkflowsSnapshot,
    }
  })

  // ── 保存勾选快照 ─────────────────────
  app.post<{ Body: SaveCheckedWorkflowsRequest }>(
    '/api/workflows/checked-save',
    async (request, reply) => {
      const { deviceId, workflowIds } = request.body
      if (!deviceId) {
        return reply.status(400).send({ success: false, code: 'INVALID_PARAMS', message: 'deviceId 为必填' })
      }
      const now = Date.now()
      // upsert: 如果已存在则替换
      const existing = db.select().from(deviceWorkflowChecks).where(eq(deviceWorkflowChecks.deviceId, deviceId)).get()
      if (existing) {
        db.update(deviceWorkflowChecks)
          .set({ workflowIds: JSON.stringify(workflowIds ?? []), updatedAt: now })
          .where(eq(deviceWorkflowChecks.deviceId, deviceId))
          .run()
      } else {
        db.insert(deviceWorkflowChecks)
          .values({ id: crypto.randomUUID(), deviceId, workflowIds: JSON.stringify(workflowIds ?? []), updatedAt: now })
          .run()
      }
      return {
        success: true as const,
        data: { deviceId, workflowIds: workflowIds ?? [], updatedAt: now } as CheckedWorkflowsSnapshot,
      }
    },
  )

  // ── 查询所有设备运行状态 ─────────────────────
  app.get('/api/workflows/device-status', async () => {
    if (!workflowService) {
      return { success: true as const, data: [] }
    }
    return { success: true as const, data: workflowService.getDeviceRunStatuses() }
  })

  // ── 查询单设备运行状态 ─────────────────────
  app.get<{ Params: { deviceId: string } }>('/api/workflows/device-status/:deviceId', async (request) => {
    if (!workflowService) {
      return { success: true as const, data: null }
    }
    const { deviceId } = request.params
    return { success: true as const, data: workflowService.getDeviceRunStatus(deviceId) }
  })
}
