// The layout before anything is saved. Its own file: the first load reads it,
// the rest of layout.ts loads with the switcher.
import type { SiteLayout } from '../../lib/api'

export const EMPTY: SiteLayout = { order: [], pinned: [], groups: [] }
