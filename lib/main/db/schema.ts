import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// 设置表 — 单行存储，id 固定为 1
// ---------------------------------------------------------------------------
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  data: text('data').notNull(), // JSON 序列化的 AppSettings
  updatedAt: integer('updated_at').notNull().default(0),
})

// ---------------------------------------------------------------------------
// 发布运行记录
// ---------------------------------------------------------------------------
export const runs = sqliteTable('runs', {
  runId: text('run_id').primaryKey(),
  status: text('status', { enum: ['running', 'success', 'failed', 'aborted'] }).notNull(),
  totalThreads: integer('total_threads').default(0),
  failedThreads: integer('failed_threads').default(0),
  settingsSnapshot: text('settings_snapshot'), // 运行时的设置快照
  startedAt: integer('started_at').notNull().default(0),
  finishedAt: integer('finished_at'),
})

// ---------------------------------------------------------------------------
// 运行日志
// ---------------------------------------------------------------------------
export const runLogs = sqliteTable('run_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id')
    .notNull()
    .references(() => runs.runId, { onDelete: 'cascade' }),
  threadId: text('thread_id'),
  level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).notNull(),
  message: text('message').notNull(),
  ts: integer('ts').notNull(),
})