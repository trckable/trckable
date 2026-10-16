// What a build of the product that has more to show (a plan, a workspace) puts into the v2 header and menus. The public
// product provides nothing: the header and the menus are the same without it. A build wraps the app in
// `V2ExtrasContext.Provider` with what it has.
import { createContext, useContext, type ReactNode } from 'react'

export interface V2Extras {
  /** Rendered in the header, after the person and before the bell (a plan chip). */
  headerExtra?: ReactNode
  /** The first row of the person's menu. */
  menuExtra?: ReactNode
  /** More rows under Notifications in the person's menu (plan & billing). */
  accountRows?: { key: string; name: ReactNode; d?: ReactNode; run: () => void }[]
  /** The workspace line at the top of the site menu, and what a press on it does. */
  workspace?: { name: string; d: string; run?: () => void }
}

export const V2ExtrasContext = createContext<V2Extras>({})

export const useV2Extras = (): V2Extras => useContext(V2ExtrasContext)
