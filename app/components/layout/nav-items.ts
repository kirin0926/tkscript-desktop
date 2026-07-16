import type { LucideIcon } from 'lucide-react'
import { AppWindow, Contact, Film, Images, ScrollText, Send } from 'lucide-react'

export type PanelKey = 'publish' | 'works' | 'material' | 'windows' | 'profile' | 'logs'

export interface NavItem {
  key: PanelKey
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { key: 'publish', label: '发布设置', icon: Send },
  { key: 'works', label: '作品设置', icon: Film },
  { key: 'material', label: '素材设置', icon: Images },
  { key: 'windows', label: '窗口列表', icon: AppWindow },
  { key: 'profile', label: '资料设置', icon: Contact },
  { key: 'logs', label: '日志线程', icon: ScrollText },
]
