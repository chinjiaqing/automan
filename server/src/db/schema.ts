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
    adbAddress: text('adb_address').notNull().default(''),  // ★ 统一 ADB 寻址
    status: text('status', { enum: ['running', 'stopped'] }).notNull().default('stopped'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('devices_adb_address_idx').on(table.adbAddress),
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

// ── workflow_run_configs 表（工作流运行配置，per-device 维度）─────
export const workflowRunConfigs = sqliteTable(
  'workflow_run_configs',
  {
    id: text('id').primaryKey(),
    deviceId: text('device_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    configJson: text('config_json').notNull().default('{}'),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('run_config_device_wf_unique').on(table.deviceId, table.workflowId),
  ],
)

export type WorkflowRunConfigRow = typeof workflowRunConfigs.$inferSelect
export type NewWorkflowRunConfigRow = typeof workflowRunConfigs.$inferInsert

