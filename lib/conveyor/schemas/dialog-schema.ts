import { z } from 'zod'

export const dialogIpcSchema = {
  'dialog-open-folder': {
    args: z.tuple([]),
    // 取消时返回 null，选择后返回所选目录的绝对路径。
    return: z.string().nullable(),
  },
}
