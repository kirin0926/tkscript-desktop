import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join, resolve } from 'path'
import { app } from 'electron'
import * as schema from './schema'

let db: BetterSQLite3Database<typeof schema> | null = null
let sqlite: Database.Database | null = null

/**
 * 获取数据库文件路径（用户数据目录）
 */
const getDbPath = (): string => {
  return join(app.getPath('userData'), 'data.db')
}

/**
 * 获取迁移文件目录路径
 * - dev：源码目录
 * - packaged：asarUnpack 后的资源目录
 */
const getMigrationsPath = (): string => {
  if (!app.isPackaged) {
    return resolve(__dirname, 'migrations')
  }
  return join(process.resourcesPath, 'migrations')
}

/**
 * 初始化数据库连接并运行迁移
 */
export const initDatabase = (): BetterSQLite3Database<typeof schema> => {
  if (db) return db

  const dbPath = getDbPath()
  sqlite = new Database(dbPath)

  // 启用 WAL 模式提升并发性能
  sqlite.pragma('journal_mode = WAL')
  // 启用外键约束
  sqlite.pragma('foreign_keys = ON')

  db = drizzle(sqlite, { schema })

  // 运行迁移
  const migrationsPath = getMigrationsPath()
  migrate(db, { migrationsFolder: migrationsPath })

  return db
}

/**
 * 获取已初始化的数据库实例（未初始化时抛出）
 */
export const getDatabase = (): BetterSQLite3Database<typeof schema> => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/**
 * 关闭数据库连接
 */
export const closeDatabase = (): void => {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
  }
}

export { schema }