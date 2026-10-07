// Where a card, or one row of it, goes in Data: today's numbers, optionally
// narrowed to one page or one country.
import { setView, type ViewState } from '../../lib/url'
import { transition } from '../../lib/viewTransition'

const TODAY: Partial<ViewState> = { live: false, period: 'today', from: undefined, to: undefined, day: undefined, bucket: 'hour', filters: [] }

export function openData(patch: Partial<ViewState> = {}): Promise<void> {
  return transition(
    () => setView({ ...TODAY, ...patch }),
    () => window.scrollTo(0, 0),
  )
}

/** The whole card: Data for today, in its explore view. */
export const openToday = () => openData()
export const openExplore = () => openData({ v: 'explore' })
export const openFiltered = (dim: string, value: string) => openData({ filters: [{ dim, value }] })
