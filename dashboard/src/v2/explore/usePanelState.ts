// What the open panel remembers while it is open: which section and tab, the filters, how many rows, the menu that is
// open, whether it is full width. One place, so every part of it reads and sets the same things.
import { useCallback, useState } from 'react'
import type { Filter } from '../../lib/api'
import type { Custom } from './ctx'
import type { Ask } from './store'
import { toggled, without } from './filters'
import { TABS } from './sections'
import type { MenuKey } from './Toolbar'
import type { FilterDim, Section, Tab } from './types'

export interface PanelState {
  tab: Tab
  filters: Filter[]
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
  full: boolean
  folded: boolean
}

const FIRST = 12
let lastTab: Tab = 'overview'
let lastFull = false
let lastFolded = false

export function usePanelState(ask: Ask, initial: Filter[]) {
  const [s, setS] = useState<PanelState>(() => ({
    tab: ask.tab ?? lastTab,
    filters: ask.filters ?? initial,
    n: FIRST,
    kind: ask.kind ?? '',
    sdim: 'q',
    edit: false,
    addAs: 'step',
    custom: { steps: [], goals: [] },
    menu: null,
    fd: null,
    manage: false,
    full: lastFull,
    folded: lastFolded,
  }))
  const set = useCallback((p: Partial<PanelState>) => setS((o) => ({ ...o, ...p })), [])
  const act = {
    section: (sec: Section) => {
      const tab = TABS[sec].includes(s.tab) ? s.tab : TABS[sec][0]
      lastTab = tab
      set({ tab, n: FIRST, menu: null, fd: null, manage: false })
    },
    tab: (tab: Tab) => {
      lastTab = tab
      set({ tab, n: FIRST, menu: null, fd: null })
    },
    pick: (dim: string, value: string) => set({ filters: toggled(s.filters, dim, value), n: FIRST }),
    setFilter: (dim: string, value: string) => set({ filters: [...without(s.filters, dim), { dim, value }], n: FIRST, menu: null, fd: null }),
    remove: (dim: string) => set({ filters: without(s.filters, dim), n: FIRST }),
    clear: () => set({ filters: [], n: FIRST, menu: null, fd: null }),
    menu: (k: MenuKey) => set({ menu: s.menu === k ? null : k, fd: null, manage: false }),
    shut: () => set({ menu: null, fd: null, manage: false }),
    full: (on: boolean) => {
      lastFull = on
      set({ full: on })
    },
    fold: () => {
      lastFolded = !s.folded
      set({ folded: !s.folded })
    },
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
