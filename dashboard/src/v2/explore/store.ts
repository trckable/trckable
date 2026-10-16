// Whether Explore is open, and what it was asked to show. Anything may open it (the chip, a card's "Go deeper", the
// keyboard); the panel over the page reads it.
import type { Filter } from '../../lib/api'
import { miniStore } from '../../lib/miniStore'
import type { Tab } from './types'

export interface Ask {
  tab?: Tab
  filters?: Filter[]
  /** The kind of sale to list. */
  kind?: string
}

/** Null while it is shut. A new object each time, so opening it again with the same ask still opens it. */
export const exploreAsk = miniStore<Ask | null>(null)

export const openExplore = (ask: Ask = {}) => exploreAsk.set({ ...ask })

export const closeExplore = () => exploreAsk.set(null)
