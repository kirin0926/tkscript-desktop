import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { appSettingsSchema, DEFAULT_SETTINGS, type AppSettings } from '@/lib/conveyor/schemas/settings-schema'
import { getDatabase, schema } from '@/lib/main/db'

// 主进程内存副本，避免频繁读库
let cache: AppSettings | null = null

/**
 * 将数据库原始对象按分组合并到默认值之上，
 * 使新增字段或旧数据缺字段时不会整体回退，提升前后兼容性。
 */
const mergeWithDefaults = (raw: unknown): AppSettings => {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const pick = (key: keyof AppSettings) =>
    typeof source[key] === 'object' && source[key] !== null ? (source[key] as Record<string, unknown>) : {}

  const merged = {
    publish: { ...DEFAULT_SETTINGS.publish, ...pick('publish') },
    works: { ...DEFAULT_SETTINGS.works, ...pick('works') },
    material: { ...DEFAULT_SETTINGS.material, ...pick('material') },
    profile: { ...DEFAULT_SETTINGS.profile, ...pick('profile') },
    windowOverrides: {
      ...DEFAULT_SETTINGS.windowOverrides,
      ...(source.windowOverrides as Record<string, unknown> | undefined),
    },
  }

  const parsed = appSettingsSchema.safeParse(merged)
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

/**
 * 从旧 JSON 文件导入设置（一次性迁移）
 */
const migrateFromJsonFile = async (): Promise<AppSettings | null> => {
  try {
    const filePath = join(app.getPath('userData'), 'settings.json')
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    const settings = mergeWithDefaults(parsed)
    // 写入数据库
    const db = getDatabase()
    const data = JSON.stringify(settings)
    const now = Date.now()
    db.insert(schema.settings)
      .values({ id: 1, data, updatedAt: now })
      .onConflictDoUpdate({ target: schema.settings.id, set: { data, updatedAt: now } })
      .run()
    console.log('[settings] 已从旧 JSON 文件迁移设置到数据库')
    return settings
  } catch {
    return null
  }
}

/**
 * 读取设置：数据库无记录时尝试从旧 JSON 文件迁移，否则回退默认值。
 */
export const loadSettings = async (): Promise<AppSettings> => {
  if (cache) {
    return cache
  }
  try {
    const db = getDatabase()
    const row = db.select().from(schema.settings).where(eq(schema.settings.id, 1)).get()
    if (row) {
      cache = mergeWithDefaults(JSON.parse(row.data))
    } else {
      // 尝试从旧 JSON 文件迁移
      const migrated = await migrateFromJsonFile()
      cache = migrated ?? DEFAULT_SETTINGS
    }
  } catch {
    cache = DEFAULT_SETTINGS
  }
  return cache
}

/**
 * 保存设置：使用 INSERT OR REPLACE 写入单行；失败时返回 false 且保留内存副本。
 */
export const saveSettings = async (next: AppSettings): Promise<boolean> => {
  cache = next
  try {
    const db = getDatabase()
    const data = JSON.stringify(next)
    const now = Date.now()
    db.insert(schema.settings)
      .values({ id: 1, data, updatedAt: now })
      .onConflictDoUpdate({ target: schema.settings.id, set: { data, updatedAt: now } })
      .run()
    return true
  } catch (error) {
    console.error('Failed to persist settings to database:', error)
    return false
  }
}

/**
 * 清空内存缓存，下次读取时重新从数据库加载
 */
export const invalidateCache = (): void => {
  cache = null
}