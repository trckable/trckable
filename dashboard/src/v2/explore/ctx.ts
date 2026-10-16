// What a section needs from the panel around it: the filters, how many rows to show, and the things a tap does.
import type { Filter } from '../../lib/api'
import type { Connected, FilterDim, Option, Tab } from './types'

export type Setup = 'rev' | 'search' | 'goals'

export interface Custom {
  steps: string[]
  goals: string[]
}

export interface XCtx {
  siteName: string
  filters: Filter[]
  options: Partial<Record<FilterDim, Option[]>>
  conn: Connected
  /** Rows shown in a table; more come with "Show all". */
  limit: number
  showAll: () => void
  /** A row was tapped: filter by it, or take the filter off when it is the one on. */
  pick: (dim: string, value: string) => void
  clearFilters: () => void
  goTo: (tab: Tab) => void
  connect: (k: Setup) => void
  how: (k: Setup) => void
  money: (minor: number) => string
  kind: string
  setKind: (k: string) => void
  sdim: 'q' | 'p'
  setSdim: (d: 'q' | 'p') => void
  edit: boolean
  setEdit: (on: boolean) => void
  addAs: 'step' | 'goal'
  setAddAs: (k: 'step' | 'goal') => void
  custom: Custom
  addCustom: (page: string) => void
  removeCustom: (kind: 'step' | 'goal', i: number) => void
  pageDetails: () => void
}
