import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/conveyor/schemas/settings-schema'

interface SettingsContextValue {
  settings: AppSettings
  loading: boolean
  update: <K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) => void
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

  return <SettingsContext.Provider value={{ settings, loading, update }}>{children}</SettingsContext.Provider>
}

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
