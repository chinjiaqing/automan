// ─────────────────────────────────────────────
// 幂等 schema 同步（CREATE TABLE IF NOT EXISTS）
// 替代 Drizzle 文件迁移，避免 journal 状态不一致问题
// ─────────────────────────────────────────────

import { sqlite } from './index.js'

export function runMigrations(): void {
  // devices
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "devices" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "ldconsole_path" text NOT NULL,
      "instance_index" integer NOT NULL,
      "status" text NOT NULL DEFAULT 'stopped',
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    )
  `)
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "devices_ldconsole_idx" ON "devices" ("ldconsole_path","instance_index")`)

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
