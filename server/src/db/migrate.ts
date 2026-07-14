// ─────────────────────────────────────────────
// 幂等 schema 同步（CREATE TABLE IF NOT EXISTS + ALTER TABLE）
// 替代 Drizzle 文件迁移，避免 journal 状态不一致问题
// ─────────────────────────────────────────────

import { sqlite } from './index.js'

export function runMigrations(): void {
  // devices
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "devices" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "adb_address" text NOT NULL DEFAULT '',
      "status" text NOT NULL DEFAULT 'stopped',
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    )
  `)

  // ── 数据迁移：旧 ldconsole_path + instance_index → adb_address ──
  migrateDevicesTable()

  // 索引必须在 migrateDevicesTable() 之后创建（旧表可能尚无 adb_address 列）
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "devices_adb_address_idx" ON "devices" ("adb_address")`)

  // workflows
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "workflows" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "device_id" text,
      "nodes_json" text NOT NULL DEFAULT '[]',
      "edges_json" text NOT NULL DEFAULT '[]',
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    )
  `)

  // device_workflow_checks
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "device_workflow_checks" (
      "id" text PRIMARY KEY NOT NULL,
      "device_id" text NOT NULL,
      "workflow_ids" text NOT NULL DEFAULT '[]',
      "updated_at" integer NOT NULL
    )
  `)
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "device_checks_unique" ON "device_workflow_checks" ("device_id")`)

  // workflow_run_configs
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "workflow_run_configs" (
      "id" text PRIMARY KEY NOT NULL,
      "device_id" text NOT NULL,
      "workflow_id" text NOT NULL,
      "config_json" text NOT NULL DEFAULT '{}',
      "updated_at" integer NOT NULL
    )
  `)
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "run_config_device_wf_unique" ON "workflow_run_configs" ("device_id","workflow_id")`)
}

/**
 * 迁移 devices 表：
 * 1. 检查旧列 ldconsole_path 是否存在
 * 2. 如果存在，从 ldconsole_path + instance_index 推导 adb_address 填充
 * 3. 旧列保留不删除（SQLite 兼容性）
 */
function migrateDevicesTable(): void {
  // 检查是否有旧列 ldconsole_path
  const columns = sqlite.pragma(`table_info('devices')`) as Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>
  const hasOldColumn = columns.some((c) => c.name === 'ldconsole_path')
  const hasNewColumn = columns.some((c) => c.name === 'adb_address')

  if (!hasNewColumn) {
    // 如果表是通过旧 schema 创建的，需要先加列
    try {
      sqlite.exec(`ALTER TABLE "devices" ADD COLUMN "adb_address" text NOT NULL DEFAULT ''`)
    } catch {
      // 列已存在，忽略
    }
  }

  if (!hasOldColumn) {
    // 新安装，无需迁移
    return
  }

  // 有旧列：先填充 adb_address
  const rows = sqlite.prepare(
    `SELECT id, ldconsole_path, instance_index, adb_address FROM devices`
  ).all() as Array<{ id: string; ldconsole_path: string; instance_index: number; adb_address: string }>

  for (const row of rows) {
    if (row.adb_address) continue
    if (!row.ldconsole_path || row.instance_index === undefined || row.instance_index === null) continue

    const port = 5555 + row.instance_index * 2
    const adbAddress = `127.0.0.1:${port}`
    sqlite.prepare(`UPDATE devices SET adb_address = ? WHERE id = ?`).run(adbAddress, row.id)
  }

  // 删除旧的 NOT NULL 列（否则新代码 INSERT 时不提供这些列会报 SQLITE_CONSTRAINT_NOTNULL）
  try { sqlite.exec(`ALTER TABLE "devices" DROP COLUMN "ldconsole_path"`) } catch { /* 列不存在或已删除 */ }
  try { sqlite.exec(`ALTER TABLE "devices" DROP COLUMN "instance_index"`) } catch { /* 列不存在或已删除 */ }
}

