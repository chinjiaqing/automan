// ─────────────────────────────────────────────
// Workflow 路由模块
// 职责：工作流 CRUD（list / create / get / save / delete）
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { db, workflows } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type {
  CreateWorkflowRequest,
  SaveWorkflowRequest,
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  RunWorkflowRequest,
  StopWorkflowRequest,
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

  // ── 保存工作流（nodes + edges）────────────────
  app.post<{ Params: { id: string }; Body: SaveWorkflowRequest }>(
    '/api/workflows/:id/save',
    async (request, reply) => {
      const { id } = request.params
      const { nodes, edges } = request.body

      const existing = db.select().from(workflows).where(eq(workflows.id, id)).get()
      if (!existing) {
        return reply.status(404).send({
          success: false,
          code: 'NOT_FOUND',
          message: `工作流 ${id} 不存在`,
        })
      }

      db.update(workflows)
        .set({
          nodesJson: JSON.stringify(nodes ?? []),
          edgesJson: JSON.stringify(edges ?? []),
          updatedAt: Date.now(),
        })
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
}
