import { z } from 'zod'
import { appSettingsSchema } from './settings-schema'

export const scriptStartReturnSchema = z.object({
  runId: z.string(),
})

export const scriptStopArgsSchema = z.object({
  runId: z.string(),
})

export const scriptLogLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

export const scriptThreadStatusSchema = z.enum(['idle', 'running', 'success', 'failed', 'aborted'])

export const scriptEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run-started'),
    runId: z.string(),
    totalThreads: z.number(),
  }),
  z.object({
    type: z.literal('thread-started'),
    runId: z.string(),
    threadId: z.string(),
    profileId: z.string(),
    profileName: z.string(),
  }),
  z.object({
    type: z.literal('log'),
    runId: z.string(),
    threadId: z.string(),
    level: scriptLogLevelSchema,
    message: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal('step'),
    runId: z.string(),
    threadId: z.string(),
    step: z.string(),
    current: z.number(),
    total: z.number(),
  }),
  z.object({
    type: z.literal('thread-finished'),
    runId: z.string(),
    threadId: z.string(),
    profileId: z.string(),
    success: z.boolean(),
  }),
  z.object({
    type: z.literal('run-finished'),
    runId: z.string(),
    success: z.boolean(),
    failedThreads: z.number(),
  }),
  z.object({
    type: z.literal('run-aborted'),
    runId: z.string(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('run-paused'),
    runId: z.string(),
  }),
  z.object({
    type: z.literal('run-resumed'),
    runId: z.string(),
  }),
])

export type ScriptEvent = z.infer<typeof scriptEventSchema>
export type ScriptLogLevel = z.infer<typeof scriptLogLevelSchema>
export type ScriptThreadStatus = z.infer<typeof scriptThreadStatusSchema>

export const scriptIpcSchema = {
  'script-start': {
    args: z.tuple([appSettingsSchema]),
    return: scriptStartReturnSchema,
  },
  'script-stop': {
    args: z.tuple([scriptStopArgsSchema]),
    return: z.boolean(),
  },
  'script-pause': {
    args: z.tuple([scriptStopArgsSchema]),
    return: z.boolean(),
  },
  'script-resume': {
    args: z.tuple([scriptStopArgsSchema]),
    return: z.boolean(),
  },
}

export const scriptEventChannels = ['script-event'] as const
export type ScriptEventChannel = (typeof scriptEventChannels)[number]
