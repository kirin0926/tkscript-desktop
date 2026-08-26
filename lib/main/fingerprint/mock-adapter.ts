import type { FingerprintAdapter, FpGroup, FpOpenWindowReturn, FpWindow } from './types'

// 示例窗口，用于无真实指纹浏览器时的开发与演示。
const MOCK_WINDOWS: FpWindow[] = [
  { seq: 1, name: '窗口 01', status: 'online', id: 'win-0001', groupId: 'group-a', groupName: '分组 A' },
  { seq: 2, name: '窗口 02', status: 'running', id: 'win-0002', groupId: 'group-a', groupName: '分组 A' },
  { seq: 3, name: '窗口 03', status: 'offline', id: 'win-0003', groupId: 'group-b', groupName: '分组 B' },
]

const MOCK_GROUPS: FpGroup[] = [
  { id: 'all', name: '全部分组' },
  { id: 'group-a', name: '分组 A' },
  { id: 'group-b', name: '分组 B' },
]

// 用于 mock 模式下递增的调试端口，避免多个窗口端口冲突。
let mockDebugPort = 9333

export const mockAdapter: FingerprintAdapter = {
  testConnection: () => Promise.resolve({ ok: true, message: 'Mock 连接成功' }),
  listWindows: () => Promise.resolve(MOCK_WINDOWS),
  listGroups: () => Promise.resolve(MOCK_GROUPS),
  openWindow: (_conn, profileId) => {
    const debugPort = mockDebugPort++
    const result: FpOpenWindowReturn = { profileId, debugPort }
    return Promise.resolve(result)
  },
  closeWindow: () => Promise.resolve(true),
  getOpenedWindows: () => Promise.resolve(MOCK_WINDOWS.filter((w) => w.status === 'running')),
}