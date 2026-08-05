import { z } from 'zod'

export const publishSettingsSchema = z.object({
  apiHost: z.string(),
  apiPort: z.string(),
  group: z.string(),
  windowSeq: z.string(),
  threads: z.string(),
  perAccount: z.string(),
  rounds: z.string(),
  uploadWait: z.string(),
})

export const worksSettingsSchema = z.object({
  title: z.string(),
  scheduled: z.boolean(),
  scheduleCount: z.string(),
  cartEnabled: z.boolean(),
  cartProductId: z.string(),
})

export const materialSettingsSchema = z.object({
  videoFolder: z.string(),
  videoMode: z.enum(['sequential', 'random']),
  runMode: z.enum(['single', 'loop']),
})

export const profileSettingsSchema = z.object({
  avatarFolder: z.string(),
  signature: z.string(),
})

export const appSettingsSchema = z.object({
  publish: publishSettingsSchema,
  works: worksSettingsSchema,
  material: materialSettingsSchema,
  profile: profileSettingsSchema,
})

export type PublishSettings = z.infer<typeof publishSettingsSchema>
export type WorksSettings = z.infer<typeof worksSettingsSchema>
export type MaterialSettings = z.infer<typeof materialSettingsSchema>
export type ProfileSettings = z.infer<typeof profileSettingsSchema>
export type AppSettings = z.infer<typeof appSettingsSchema>

/**
 * 默认设置，需与各面板初始值保持一致。
 * 设置文件缺失或损坏时回退到此。
 */
export const DEFAULT_SETTINGS: AppSettings = {
  publish: {
    apiHost: 'http://127.0.0.1',
    apiPort: '53200',
    group: 'all',
    windowSeq: '',
    threads: '1',
    perAccount: '1',
    rounds: '1',
    uploadWait: '30',
  },
  works: {
    title: '',
    scheduled: false,
    scheduleCount: '1',
    cartEnabled: false,
    cartProductId: '',
  },
  material: {
    videoFolder: '',
    videoMode: 'sequential',
    runMode: 'single',
  },
  profile: {
    avatarFolder: '',
    signature: '',
  },
}

export const settingsIpcSchema = {
  'settings-load': {
    args: z.tuple([]),
    return: appSettingsSchema,
  },
  'settings-save': {
    args: z.tuple([appSettingsSchema]),
    return: z.boolean(),
  },
}
