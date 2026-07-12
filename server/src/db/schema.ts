// ─────────────────────────────────────────────
// Drizzle Schema 定义
// ─────────────────────────────────────────────

import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ── devices 表 ────────────────────────────────
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ldconsolePath: text('ldconsole_path').notNull(),
    instanceIndex: integer('instance_index').notNull(),
    status: text('status', { enum: ['running', 'stopped'] }).notNull().default('stopped'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('devices_ldconsole_idx').on(table.ldconsolePath, table.instanceIndex),
  ],
)

// ── 类型推导 ─────────────────────────────────
export type DeviceRow = typeof devices.$inferSelect
export type NewDeviceRow = typeof devices.$inferInsert

// ── workflows 表 ──────────────────────────
export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    deviceId: text('device_id'),
    nodesJson: text('nodes_json').notNull().default('[]'),
    edgesJson: text('edges_json').notNull().default('[]'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
)

export type WorkflowRow = typeof workflows.$inferSelect
export type NewWorkflowRow = typeof workflows.$inferInsert

// ── device_workflow_checks 表（勾选快照持久化）─────
export const deviceWorkflowChecks = sqliteTable(
  'device_workflow_checks',
  {
    id: text('id').primaryKey(),
    deviceId: text('device_id').notNull(),
    workflowIds: text('workflow_ids').notNull().default('[]'),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('device_checks_unique').on(table.deviceId),
  ],
)

export type DeviceWorkflowCheckRow = typeof deviceWorkflowChecks.$inferSelect
export type NewDeviceWorkflowCheckRow = typeof deviceWorkflowChecks.$inferInsert
