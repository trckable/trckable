// A journey's source or page becomes a filter on the period's numbers: from
// Live, that means going back to them.
import { setView, type ViewState } from '../../lib/url'

export function filterFrom(view: ViewState, dim: string, value: string) {
  const rest = view.filters.filter((f) => f.dim !== dim)
  setView({ filters: [...rest, { dim, value }], day: undefined, live: false })
}
