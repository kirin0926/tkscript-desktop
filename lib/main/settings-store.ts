import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { appSettingsSchema, DEFAULT_SETTINGS, type AppSettings } from '@/lib/conveyor/schemas/settings-schema'

const SETTINGS_FILE = 'settings.json'

// 主进程内存副本，读操作直接返回它，避免频繁读盘。
let cache: AppSettings | null = null

const getFilePath = () => join(app.getPath('userData'), SETTINGS_FILE)

/**
 * 将磁盘上的原始对象按分组合并到默认值之上，
 * 使新增字段或旧文件缺字段时不会整体回退，提升前后兼容性。
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
  }

  const parsed = appSettingsSchema.safeParse(merged)
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

/**
 * 读取设置：文件缺失、内容为空、JSON 解析失败或校验失败时回退默认值，不抛出。
 */
export const loadSettings = async (): Promise<AppSettings> => {
  if (cache) {
    return cache
  }
  try {
    const raw = await readFile(getFilePath(), 'utf-8')
    cache = mergeWithDefaults(JSON.parse(raw))
  } catch {
    cache = DEFAULT_SETTINGS
  }
  return cache
}

/**
 * 保存设置：先写临时文件再重命名，保证原子性；失败时返回 false 且保留内存副本。
 */
export const saveSettings = async (next: AppSettings): Promise<boolean> => {
  cache = next
  const target = getFilePath()
  const tmp = `${target}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8')
    await rename(tmp, target)
    return true
  } catch (error) {
    console.error('Failed to persist settings:', error)
    return false
  }
}
