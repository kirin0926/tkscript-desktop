import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { DEFAULT_SETTINGS, type AppSettings, type OverridableSection } from '@/lib/conveyor/schemas/settings-schema'

interface SettingsContextValue {
  settings: AppSettings
  loading: boolean
  update: <K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) => void
  updateWindowOverride: (windowId: string, section: OverridableSection, patch: Record<string, unknown>) => void
  clearWindowOverride: (windowId: string, section?: OverridableSection) => void
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined)

const SAVE_DEBOUNCE_MS = 400

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const settingsApi = useConveyor('settings')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  // 最新设置的即时引用，供防抖保存与卸载 flush 使用。
  const settingsRef = useRef<AppSettings>(settings)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初次加载：从主进程读取持久化设置。
  useEffect(() => {
    let active = true
    settingsApi
      .load()
      .then((loaded) => {
        if (!active) {
          return
        }
        settingsRef.current = loaded
        setSettings(loaded)
      })
      .catch((error) => {
        console.error('Failed to load settings:', error)
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [settingsApi])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      settingsApi.save(settingsRef.current).catch((error) => {
        console.error('Failed to save settings:', error)
      })
    }, SAVE_DEBOUNCE_MS)
  }, [settingsApi])

  const update = useCallback<SettingsContextValue['update']>(
    (section, patch) => {
      setSettings((prev) => {
        const next = { ...prev, [section]: { ...prev[section], ...patch } } as AppSettings
        settingsRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave]
  )

  const updateWindowOverride = useCallback<SettingsContextValue['updateWindowOverride']>(
    (windowId, section, patch) => {
      setSettings((prev) => {
        const overrides = prev.windowOverrides ?? {}
        const existing = overrides[windowId] ?? {}
        const next = {
          ...prev,
          windowOverrides: {
            ...overrides,
            [windowId]: {
              ...existing,
              [section]: { ...(existing[section] as Record<string, unknown> | undefined), ...patch },
            },
          },
        }
        settingsRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave, setSettings]
  )

  const clearWindowOverride = useCallback<SettingsContextValue['clearWindowOverride']>(
    (windowId, section) => {
      setSettings((prev) => {
        const overrides = prev.windowOverrides ?? {}
        if (section) {
          // 清除窗口下某个设置分类的覆盖
          const existing = overrides[windowId]
          if (!existing) return prev
          const rest = Object.fromEntries(
            Object.entries(existing).filter(([k]) => k !== section)
          )
          if (Object.keys(rest).length === 0) {
            // 该窗口再无任何覆盖，移除此条目
            const { [windowId]: _removed, ...remaining } = overrides
            const next = { ...prev, windowOverrides: remaining }
            settingsRef.current = next
            return next
          }
          const next = { ...prev, windowOverrides: { ...overrides, [windowId]: rest } }
          settingsRef.current = next
          return next
        } else {
          // 清除该窗口所有覆盖
          const { [windowId]: _removed, ...rest } = overrides
          const next = { ...prev, windowOverrides: rest }
          settingsRef.current = next
          return next
        }
      })
      scheduleSave()
    },
    [scheduleSave, setSettings]
  )

  // 卸载时若有未落盘的变更，立即保存。
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        settingsApi.save(settingsRef.current).catch((error) => {
          console.error('Failed to flush settings:', error)
        })
      }
    }
  }, [settingsApi])

  return <SettingsContext.Provider value={{ settings, loading, update, updateWindowOverride, clearWindowOverride }}>{children}</SettingsContext.Provider>
}

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
