// What a build of the product that has more to show (a plan, a workspace) puts into the v2 header and menus. The public
// product provides nothing: the header and the menus are the same without it. A build wraps the app in
// `V2ExtrasContext.Provider` with what it has.
import { createContext, useContext, type ReactNode } from 'react'
import type { AccountAlert } from '../components/AccountDot'
import type { Notice } from './bell/notices'

/** A site waiting to be handed to someone: a note and a Stop on its row, an amber dot. */
export interface SiteMove {
  text: string
  title: string
  stopLabel: string
  stopWord: string
  stop: () => void
}

/** The person's teams, for the square at the start of the header. Switching is the build's: it moves the whole page to the team picked. */
export interface Teams {
  list: { id: string; name: string; /** The team's own mark at `size` px, in place of the initial on a square. */ mark?: (size: number) => ReactNode; /** A team that cannot be opened: its row is drawn off. */ off?: boolean }[]
  /** The id of the team in view. */
  current: string
  onPick: (id: string) => void
  onManage: () => void
}

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
    /** Read the build's own list again: called when the bell opens, when a tab is shown after a minute away and when /now answers (at most once a minute), so its rows and the badge follow the same moments as the public ones. */
    refresh?: () => void
    readAll: () => void
    dismiss: (id: string) => void
    archive: { items: Notice[]; load: () => void; loading: boolean; words: { dismiss: string; archive: string; fresh: string; none: string } }
  }
  /** The teams the person is in: a small square with the current one's initial before the site, and a list of them that opens from it. A build with a single account leaves it out. */
  teams?: Teams
  /** A site that is being handed to someone, by its id and name. */
  siteMoves?: (siteId: string, name: string) => SiteMove | undefined
  /** The signed-in person's name, when their profile has none (on the account button and in the menu). */
  personName?: string
  /** The word on the person's role tag in the menu, in place of Owner or Viewer. */
  personRole?: string
  /** Rows between the person and Profile in the menu. */
  menuBeforeProfile?: ReactNode | ((go: (fn: () => void) => () => void) => ReactNode)
  /** What Sign out does, when it is more than ending this session. */
  signOut?: () => void
  /** Opens Peek with a question ready to send. A build with no Peek leaves it out, and a "Why?" shows its text alone. */
  askPeek?: (question: string) => void
  /** Draws "Add a site" in the site menu through this (it may show it off, with a reason). */
  addSiteGuard?: (render: (off: boolean) => ReactNode) => ReactNode
}

// The public product never reads these exports itself: a build that has more wraps the app in the provider.
export const V2ExtrasContext = createContext<V2Extras>({})

export const useV2Extras = (): V2Extras => useContext(V2ExtrasContext)
