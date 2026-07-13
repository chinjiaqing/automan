// ─────────────────────────────────────────────
// 数据库连接初始化
// ─────────────────────────────────────────────

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 数据目录：AUTOMAN_DATA_DIR 环境变量优先（桌面版注入用户数据目录），默认项目根目录/data
export const DATA_DIR = resolve(
  process.env.AUTOMAN_DATA_DIR ?? resolve(__dirname, '..', '..', '..', '..', 'data'),
)
const DB_PATH = resolve(DATA_DIR, 'automan.db')

// 确保 data/ 目录存在
mkdirSync(dirname(DB_PATH), { recursive: true })

// 创建 better-sqlite3 连接
export const sqlite = new Database(DB_PATH)

// 启用 WAL 模式 + 外键约束
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// 创建 Drizzle 实例
export const db = drizzle(sqlite, { schema })

// 重导出 schema 和类型
export * from './schema.js'
