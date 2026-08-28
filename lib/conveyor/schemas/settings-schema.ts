import { z } from 'zod'

export const publishSettingsSchema = z.object({
  apiHost: z.string(),
  apiPort: z.string(),
  apiKey: z.string().optional(),
  fingerprintType: z.enum(['ixbrowser', 'hubstudio']).default('ixbrowser'),
  /** HubStudio 客户端登录凭证 */
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  groupCode: z.string().optional(),
  group: z.string(),
  windowSeq: z.string(),
  /** 本次启动勾选的窗口 ID 列表（仅随启动参数临时传递，不落盘；存在时优先于 windowSeq） */
  windowIds: z.array(z.string()).optional(),
  threads: z.string(),
  perAccount: z.string(),
  rounds: z.string(),
  uploadWait: z.string(),
  /** 上传完成后等待版权检测的时间（秒） */
  detectWait: z.string(),
  /** 发布完成后关闭当前窗口环境 */
  closeAfterPublish: z.boolean().default(false),
  /** 发布完成后关闭窗口前的等待时间（秒） */
  closeWait: z.string(),
})

export const worksSettingsSchema = z.object({
  title: z.string(),
  hashtags: z.string(),
  scheduled: z.boolean(),
  scheduleCount: z.string(),
})

export const materialSettingsSchema = z.object({
  videoFolder: z.string(),
  videoMode: z.enum(['sequential', 'random']),
  runMode: z.enum(['single', 'loop']),
  /** 发布完成后对已发送视频文件的处理方式：keep=保留循环使用，mark=标记已发送，delete=删除文件 */
  sentFileAction: z.enum(['keep', 'mark', 'delete']).default('keep'),
})

export const profileSettingsSchema = z.object({
  avatarFolder: z.string(),
  signature: z.string(),
})

/** 窗口覆盖专用的素材设置 schema（不带 .default()，避免覆盖全局设置） */
export const materialOverrideSchema = z.object({
  videoFolder: z.string().optional(),
  videoMode: z.enum(['sequential', 'random']).optional(),
  runMode: z.enum(['single', 'loop']).optional(),
  sentFileAction: z.enum(['keep', 'mark', 'delete']).optional(),
})

/** 单个窗口的覆盖设置（与全局设置合并使用） */
export const windowOverrideSchema = z.object({
  profile: profileSettingsSchema.partial().optional(),
  material: materialOverrideSchema.optional(),
  works: worksSettingsSchema.partial().optional(),
})

export const appSettingsSchema = z.object({
  publish: publishSettingsSchema,
  works: worksSettingsSchema,
  material: materialSettingsSchema,
  profile: profileSettingsSchema,
  windowOverrides: z.record(z.string(), windowOverrideSchema).default({}),
})

export type PublishSettings = z.infer<typeof publishSettingsSchema>
export type WorksSettings = z.infer<typeof worksSettingsSchema>
export type MaterialSettings = z.infer<typeof materialSettingsSchema>
export type ProfileSettings = z.infer<typeof profileSettingsSchema>
export type WindowOverride = z.infer<typeof windowOverrideSchema>
export type AppSettings = z.infer<typeof appSettingsSchema>

export type OverridableSection = 'profile' | 'material' | 'works'

/**
 * 默认设置，需与各面板初始值保持一致。
 * 设置文件缺失或损坏时回退到此。
 */
export const DEFAULT_SETTINGS: AppSettings = {
  publish: {
    apiHost: 'http://127.0.0.1',
    apiPort: '53200',
    apiKey: '',
    fingerprintType: 'ixbrowser',
    appId: '',
    appSecret: '',
    groupCode: '',
    group: 'all',
    windowSeq: '',
    threads: '1',
    perAccount: '1',
    rounds: '1',
    uploadWait: '30',
    detectWait: '30',
    closeAfterPublish: false,
    closeWait: '15',
  },
  works: {
    title: '',
    hashtags: '',
    scheduled: false,
    scheduleCount: '1',
  },
  material: {
    videoFolder: '',
    videoMode: 'sequential',
    runMode: 'single',
    sentFileAction: 'keep',
  },
  profile: {
    avatarFolder: '',
    signature: '',
  },
  windowOverrides: {},
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
