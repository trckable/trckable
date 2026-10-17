// What a build of the product that has more to show (a plan, a workspace) puts into the v2 header and menus. The public
// product provides nothing: the header and the menus are the same without it. A build wraps the app in
// `V2ExtrasContext.Provider` with what it has.
import { createContext, useContext, type ReactNode } from 'react'
import type { AccountAlert } from '../components/AccountDot'
import type { Notice } from './bell/notices'

export interface V2Extras {
  /** Rendered in the header, after the person and before the bell (a plan chip). */
  headerExtra?: ReactNode
  /** The first row of the person's menu. */
  menuExtra?: ReactNode
  /** Rows right below the person's Profile (a build's own page of the account). */
  menuAfterProfile?: ReactNode | ((go: (fn: () => void) => () => void) => ReactNode)
  /** A dot on the person's avatar when the account needs them (a limit reached): the public product has none. */
  accountAlert?: AccountAlert | null
  /** More rows of the bell, after the ones the site tells itself (a build's own notices). */
  bell?: Notice[]
  /** A build with its own list: Mark all read reaches it, a notice can be put away, and what was read or put away is an archive. */
  bellMore?: {
    readAll: () => void
    dismiss: (id: string) => void
    archive: { items: Notice[]; load: () => void; loading: boolean; words: { dismiss: string; archive: string; fresh: string; none: string } }
  }
  /** The workspace line at the top of the site menu, and what a press on it does. */
  workspace?: { name: string; d: string; run?: () => void }
}

// The public product never reads these exports itself: a build that has more wraps the app in the provider.
export const V2ExtrasContext = createContext<V2Extras>({})

export const useV2Extras = (): V2Extras => useContext(V2ExtrasContext)
