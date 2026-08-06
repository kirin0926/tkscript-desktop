import { create } from 'zustand'
import type { FpWindow } from '@/lib/conveyor/schemas/fingerprint-schema'

interface WindowListState {
  windows: FpWindow[]
  lastFetched: number | null
  loading: boolean
  error: string | null
  selectedIds: string[]

  setWindows: (windows: FpWindow[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSelectedIds: (ids: string[]) => void
  toggleOne: (id: string, checked: boolean) => void
  toggleAll: (checked: boolean, allIds: string[]) => void
  reset: () => void
}

const DEFAULTS = {
  windows: [] as FpWindow[],
  lastFetched: null as number | null,
  loading: false,
  error: null as string | null,
  selectedIds: [] as string[],
}

export const useWindowListStore = create<WindowListState>((set) => ({
  ...DEFAULTS,

  setWindows: (windows) => set({ windows, lastFetched: Date.now(), error: null }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  setSelectedIds: (ids) => set({ selectedIds: ids }),

  toggleOne: (id, checked) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (checked) next.add(id)
      else next.delete(id)
      return { selectedIds: [...next] }
    }),

  toggleAll: (checked, allIds) =>
    set({ selectedIds: checked ? [...allIds] : [] }),

  reset: () => set({ ...DEFAULTS }),
}))