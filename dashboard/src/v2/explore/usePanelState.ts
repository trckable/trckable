// What the open panel remembers while it is open: how many rows, the kind of sale, the menu that is open, the funnel
// being edited. The table it is on and what it narrows by are the address's (open.ts); full width and the folded
// list of sections are kept for next time.
import { useCallback, useState } from 'react'
import type { Filter } from '../../lib/api'
import { setView } from '../../lib/url'
import type { Custom } from './ctx'
import { toggled, without } from './filters'
import type { Ask } from './open'
import { TABS } from './sections'
import type { MenuKey } from './Toolbar'
import type { FilterDim, Section, Tab } from './types'

export interface PanelState {
  /** Rows shown in a table. */
  n: number
  kind: string
  sdim: 'q' | 'p'
  edit: boolean
  addAs: 'step' | 'goal'
  custom: Custom
  menu: MenuKey | null
  fd: FilterDim | null
  manage: boolean
}

const FIRST = 12

export function usePanelState(ask: Ask) {
  const [s, setS] = useState<PanelState>(() => ({ n: FIRST, kind: '', sdim: 'q', edit: false, addAs: 'step', custom: { steps: [], goals: [] }, menu: null, fd: null, manage: false }))
  const set = useCallback((p: Partial<PanelState>) => setS((o) => ({ ...o, ...p })), [])
  const { tab, filters } = ask
  const narrow = (next: Filter[], more: Partial<PanelState> = {}) => {
    setView({ xf: next })
    set({ n: FIRST, ...more })
  }
  const act = {
    section: (sec: Section) => {
      const to: Tab = TABS[sec].includes(tab) ? tab : TABS[sec][0]
      setView({ xp: to, xf: filters })
      set({ n: FIRST, menu: null, fd: null, manage: false })
    },
    tab: (to: Tab) => {
      setView({ xp: to, xf: filters })
      set({ n: FIRST, menu: null, fd: null })
    },
    pick: (dim: string, value: string) => narrow(toggled(filters, dim, value)),
    setFilter: (dim: string, value: string) => narrow([...without(filters, dim), { dim, value }], { menu: null, fd: null }),
    remove: (dim: string) => narrow(without(filters, dim)),
    clear: () => narrow([], { menu: null, fd: null }),
    apply: (next: Filter[]) => narrow(next, { menu: null }),
    menu: (k: MenuKey) => set({ menu: s.menu === k ? null : k, fd: null, manage: false }),
    shut: () => set({ menu: null, fd: null, manage: false }),
    addCustom: (page: string) => {
      const key = s.addAs === 'goal' ? 'goals' : 'steps'
      if (s.custom[key].includes(page)) return
      set({ custom: { ...s.custom, [key]: [...s.custom[key], page] } })
    },
    removeCustom: (kind: 'step' | 'goal', i: number) => {
      const key = kind === 'goal' ? 'goals' : 'steps'
      set({ custom: { ...s.custom, [key]: s.custom[key].filter((_, j) => j !== i) } })
    },
  }
  return { s, set, act }
}
