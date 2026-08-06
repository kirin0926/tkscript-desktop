import { z } from 'zod'

export const fpWindowSchema = z.object({
  seq: z.number(),
  name: z.string(),
  status: z.enum(['online', 'running', 'offline']),
  id: z.string(),
})

export const fpGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const fpConnSchema = z.object({
  apiHost: z.string(),
  apiPort: z.string(),
  apiKey: z.string().optional(),
  fingerprintType: z.enum(['ixbrowser', 'hubstudio']).default('ixbrowser'),
  /** HubStudio 客户端登录凭证 */
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  groupCode: z.string().optional(),
})

export const fpOpenWindowReturnSchema = z.object({
  profileId: z.string(),
  debugPort: z.number(),
})

export const fpConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})

export type FpWindow = z.infer<typeof fpWindowSchema>
export type FpGroup = z.infer<typeof fpGroupSchema>
export type FpConn = z.infer<typeof fpConnSchema>
export type FpOpenWindowReturn = z.infer<typeof fpOpenWindowReturnSchema>
export type FpConnectionTestResult = z.infer<typeof fpConnectionTestResultSchema>

export const fingerprintIpcSchema = {
  'fingerprint-test-connection': {
    args: z.tuple([fpConnSchema]),
    return: fpConnectionTestResultSchema,
  },
  'fingerprint-list-windows': {
    args: z.tuple([fpConnSchema]),
    return: z.array(fpWindowSchema),
  },
  'fingerprint-list-groups': {
    args: z.tuple([fpConnSchema]),
    return: z.array(fpGroupSchema),
  },
  'fingerprint-open-window': {
    args: z.tuple([fpConnSchema, z.string()]),
    return: fpOpenWindowReturnSchema,
  },
  'fingerprint-close-window': {
    args: z.tuple([fpConnSchema, z.string()]),
    return: z.boolean(),
  },
  'fingerprint-get-opened-windows': {
    args: z.tuple([fpConnSchema]),
    return: z.array(fpWindowSchema),
  },
}