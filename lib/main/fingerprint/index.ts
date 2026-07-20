import type { FingerprintAdapter } from './types'
import { mockAdapter } from './mock-adapter'
import { httpAdapter } from './http-adapter'

/**
 * 选择指纹浏览器适配器。
 * 默认使用 mock，保证无真实指纹浏览器时应用可独立运行；
 * 设置环境变量 TKS_FINGERPRINT_ADAPTER=http 可切换到真实 HTTP 适配器。
 */
export const selectAdapter = (): FingerprintAdapter => {
  if (process.env.TKS_FINGERPRINT_ADAPTER === 'http') {
    return httpAdapter
  }
  return mockAdapter
}
