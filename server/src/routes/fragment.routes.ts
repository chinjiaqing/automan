// ─────────────────────────────────────────────
// Fragment（片段）路由模块
// 职责：片段 CRUD + 片段分组 CRUD
// ─────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { db, fragments, fragmentGroups, workflows } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type {
  Fragment,
  FragmentGroup,
  FragmentParam,
  CreateFragmentRequest,
  SaveFragmentRequest,
  CreateFragmentGroupRequest,
  UpdateFragmentGroupRequest,
  WorkflowNode,
  WorkflowEdge,
} from '@automan/shared/types.js'

/** 将 DB Row 转为 Fragment */
function toFragment(row: typeof fragments.$inferSelect): Fragment {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    groupId: row.groupId,
    inputs: JSON.parse(row.inputsJson) as FragmentParam[],
    outputs: JSON.parse(row.outputsJson) as FragmentParam[],
    nodes: JSON.parse(row.nodesJson) as WorkflowNode[],
    edges: JSON.parse(row.edgesJson) as WorkflowEdge[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** 将 DB Row 转为 FragmentGroup */
function toFragmentGroup(row: typeof fragmentGroups.$inferSelect): FragmentGroup {
  return {
    id: row.id,
    name: row.name,
    sort: row.sort,
  }
}

export async function fragmentRoutes(app: FastifyInstance): Promise<void> {
  // ════════════════════════════════════════════
  //  片段分组（Fragment Groups）
  // ════════════════════════════════════════════

  // ── 查询所有分组 ──────────────────────────
  app.get('/api/fragment-groups', async () => {
    const rows = db.select().from(fragmentGroups).orderBy(fragmentGroups.sort).all()
    return { success: true as const, data: rows.map(toFragmentGroup) }
  })

  // ── 创建分组 ──────────────────────────────
  app.post<{ Body: CreateFragmentGroupRequest }>(
    '/api/fragment-groups',
    async (request, reply) => {
      const { name, sort } = request.body
      if (!name) {
        return reply.status(400).send({
          success: false, code: 'INVALID_PARAMS', message: 'name 为必填',
        })
      }
      const id = crypto.randomUUID()
      db.insert(fragmentGroups)
        .values({ id, name, sort: sort ?? 0 })
        .run()
      const row = db.select().from(fragmentGroups).where(eq(fragmentGroups.id, id)).get()!
      app.log.info(`FragmentGroup created: ${name}`)
      return { success: true as const, data: toFragmentGroup(row) }
    },
  )

  // ── 更新分组 ──────────────────────────────
  app.post<{ Body: UpdateFragmentGroupRequest }>(
    '/api/fragment-groups/update',
    async (request, reply) => {
      const { id, name, sort } = request.body
      if (!id) {
        return reply.status(400).send({
          success: false, code: 'INVALID_PARAMS', message: 'id 为必填',
        })
      }
      const existing = db.select().from(fragmentGroups).where(eq(fragmentGroups.id, id)).get()
      if (!existing) {
        return reply.status(404).send({
          success: false, code: 'NOT_FOUND', message: `分组 ${id} 不存在`,
        })
      }
      const updateData: Record<string, unknown> = {}
      if (name !== undefined) updateData.name = name
      if (sort !== undefined) updateData.sort = sort
      if (Object.keys(updateData).length > 0) {
        db.update(fragmentGroups).set(updateData).where(eq(fragmentGroups.id, id)).run()
      }
      const row = db.select().from(fragmentGroups).where(eq(fragmentGroups.id, id)).get()!
      return { success: true as const, data: toFragmentGroup(row) }
    },
  )

  // ── 删除分组 ──────────────────────────────
  app.post<{ Body: { id: string } }>(
    '/api/fragment-groups/delete',
    async (request, reply) => {
      const { id } = request.body
      if (!id) {
        return reply.status(400).send({
          success: false, code: 'INVALID_PARAMS', message: 'id 为必填',
        })
      }
      // 删除分组时，将组内片段的 groupId 清空
      db.update(fragments)
        .set({ groupId: '' })
        .where(eq(fragments.groupId, id))
        .run()
      db.delete(fragmentGroups).where(eq(fragmentGroups.id, id)).run()
      app.log.info(`FragmentGroup deleted: ${id}`)
      return { success: true as const, data: { id } }
    },
  )

  // ════════════════════════════════════════════
  //  片段（Fragments）
  // ════════════════════════════════════════════

  // ── 查询所有片段 ──────────────────────────
  app.get('/api/fragments', async () => {
    const rows = db.select().from(fragments).orderBy(fragments.createdAt).all()
    return { success: true as const, data: rows.map(toFragment) }
  })

  // ── 创建片段 ──────────────────────────────
  app.post<{ Body: CreateFragmentRequest }>(
    '/api/fragments',
    async (request, reply) => {
      const { name, description, groupId, inputs, outputs } = request.body
      if (!name) {
        return reply.status(400).send({
          success: false, code: 'INVALID_PARAMS', message: 'name 为必填',
        })
      }

      const now = Date.now()
      const id = crypto.randomUUID()

      // 默认节点：仅 start
      const defaultNodes: WorkflowNode[] = [
        { id: 'start_1', type: 'start', label: '开始', position: { x: 250, y: 50 }, config: {} },
      ]

      db.insert(fragments)
        .values({
          id,
          name,
          description: description ?? '',
          groupId: groupId ?? '',
          inputsJson: JSON.stringify(inputs ?? []),
          outputsJson: JSON.stringify(outputs ?? []),
          nodesJson: JSON.stringify(defaultNodes),
          edgesJson: '[]',
          createdAt: now,
          updatedAt: now,
        })
        .run()

      const row = db.select().from(fragments).where(eq(fragments.id, id)).get()!
      app.log.info(`Fragment created: ${name}`)
      return { success: true as const, data: toFragment(row) }
    },
  )

  // ── 获取单个片段 ─────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/fragments/:id',
    async (request, reply) => {
      const { id } = request.params
      const row = db.select().from(fragments).where(eq(fragments.id, id)).get()
      if (!row) {
        return reply.status(404).send({
          success: false, code: 'NOT_FOUND', message: `片段 ${id} 不存在`,
        })
      }
      return { success: true as const, data: toFragment(row) }
    },
  )

  // ── 保存片段（nodes + edges + 元数据）──────
  app.post<{ Params: { id: string }; Body: SaveFragmentRequest }>(
    '/api/fragments/:id/save',
    async (request, reply) => {
      const { id } = request.params
      const { name, description, groupId, inputs, outputs, nodes, edges } = request.body

      const existing = db.select().from(fragments).where(eq(fragments.id, id)).get()
      if (!existing) {
        return reply.status(404).send({
          success: false, code: 'NOT_FOUND', message: `片段 ${id} 不存在`,
        })
      }

      const updateData: Record<string, unknown> = { updatedAt: Date.now() }
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (groupId !== undefined) updateData.groupId = groupId
      if (inputs !== undefined) updateData.inputsJson = JSON.stringify(inputs)
      if (outputs !== undefined) updateData.outputsJson = JSON.stringify(outputs)
      if (nodes !== undefined) updateData.nodesJson = JSON.stringify(nodes)
      if (edges !== undefined) updateData.edgesJson = JSON.stringify(edges)

      db.update(fragments).set(updateData).where(eq(fragments.id, id)).run()

      const row = db.select().from(fragments).where(eq(fragments.id, id)).get()!
      app.log.info(`Fragment saved: ${row.name}`)
      return { success: true as const, data: toFragment(row) }
    },
  )

  // ── 删除片段 ──────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/fragments/:id/delete',
    async (request, reply) => {
      const { id } = request.params
      const existing = db.select().from(fragments).where(eq(fragments.id, id)).get()
      if (!existing) {
        return reply.status(404).send({
          success: false, code: 'NOT_FOUND', message: `片段 ${id} 不存在`,
        })
      }

      // 引用检查：扫描所有工作流和片段，查找是否有 call 节点引用此片段
      const referencedBy: string[] = []
      const allWorkflows = db.select().from(workflows).all()
      for (const wf of allWorkflows) {
        const nodes: WorkflowNode[] = JSON.parse(wf.nodesJson)
        if (nodes.some((n) => n.type === 'call' && n.config.fragmentId === id)) {
          referencedBy.push(`工作流「${wf.name}」`)
        }
      }
      const allFragments = db.select().from(fragments).all()
      for (const frag of allFragments) {
        if (frag.id === id) continue
        const nodes: WorkflowNode[] = JSON.parse(frag.nodesJson)
        if (nodes.some((n) => n.type === 'call' && n.config.fragmentId === id)) {
          referencedBy.push(`片段「${frag.name}」`)
        }
      }

      if (referencedBy.length > 0) {
        return reply.status(400).send({
          success: false,
          code: 'FRAGMENT_IN_USE',
          message: `无法删除：片段「${existing.name}」正被 ${referencedBy.join('、')} 引用`,
        })
      }

      db.delete(fragments).where(eq(fragments.id, id)).run()
      app.log.info(`Fragment deleted: ${existing.name}`)
      return { success: true as const, data: { id } }
    },
  )
}
