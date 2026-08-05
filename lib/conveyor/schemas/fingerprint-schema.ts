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
})

export const fpOpenWindowReturnSchema = z.object({
  profileId: z.string(),
  debugPort: z.number(),
})

export type FpWindow = z.infer<typeof fpWindowSchema>
export type FpGroup = z.infer<typeof fpGroupSchema>
export type FpConn = z.infer<typeof fpConnSchema>
export type FpOpenWindowReturn = z.infer<typeof fpOpenWindowReturnSchema>

export const fingerprintIpcSchema = {
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
}
