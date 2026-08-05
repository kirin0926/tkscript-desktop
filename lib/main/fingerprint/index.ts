import type { FingerprintAdapter } from './types'
import { mockAdapter } from './mock-adapter'
import { httpAdapter } from './http-adapter'

/**
 * 选择指纹浏览器适配器。
 * 默认使用 http 适配器对接 ixBrowser；
 * 设置环境变量 TKS_FINGERPRINT_ADAPTER=mock 可回退到 mock 适配器，
 * 用于无真实 ixBrowser 时的开发与演示。
 */
export const selectAdapter = (): FingerprintAdapter => {
  if (process.env.TKS_FINGERPRINT_ADAPTER === 'mock') {
    return mockAdapter
  }
  return httpAdapter
}
