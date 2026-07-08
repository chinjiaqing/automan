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
