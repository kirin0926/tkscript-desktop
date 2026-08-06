import { z } from 'zod'

export const appIpcSchema = {
  version: {
    args: z.tuple([]),
    return: z.string(),
  },
  'open-folder': {
    args: z.tuple([z.string()]),
    return: z.boolean(),
  },
  'list-files': {
    args: z.tuple([z.string(), z.string().optional()]),
    return: z.array(z.string()),
  },
}
