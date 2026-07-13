// ─────────────────────────────────────────────
// 应用内迁移执行器
// ─────────────────────────────────────────────

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './index.js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 迁移目录：AUTOMAN_MIGRATIONS_DIR 环境变量优先（桌面版打包后注入），默认 server/drizzle
const MIGRATIONS_DIR =
  process.env.AUTOMAN_MIGRATIONS_DIR ?? resolve(__dirname, '..', '..', 'drizzle')

export function runMigrations(): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}
