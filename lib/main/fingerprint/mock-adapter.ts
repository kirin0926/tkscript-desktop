import type { FingerprintAdapter, FpGroup, FpWindow } from './types'

// 示例窗口，用于无真实指纹浏览器时的开发与演示。
const MOCK_WINDOWS: FpWindow[] = [
  { seq: 1, name: '窗口 01', status: 'online', id: 'win-0001' },
  { seq: 2, name: '窗口 02', status: 'running', id: 'win-0002' },
  { seq: 3, name: '窗口 03', status: 'offline', id: 'win-0003' },
]

const MOCK_GROUPS: FpGroup[] = [
  { id: 'all', name: '全部分组' },
  { id: 'group-a', name: '分组 A' },
  { id: 'group-b', name: '分组 B' },
]

export const mockAdapter: FingerprintAdapter = {
  listWindows: () => Promise.resolve(MOCK_WINDOWS),
  listGroups: () => Promise.resolve(MOCK_GROUPS),
}
