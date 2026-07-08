// ─────────────────────────────────────────────
// 应用内迁移执行器
// ─────────────────────────────────────────────

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './index.js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'drizzle')

export function runMigrations(): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}
