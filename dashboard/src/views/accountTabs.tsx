// The account window's tabs: Sites, API keys, People and Account. A viewer
// has Account alone: asked for another, they land on their own account.
import { CircleUser, Globe, KeyRound, Users } from 'lucide-react'
import type { AccountTab } from '../lib/account'
import { isViewer } from '../lib/me'
import { copy } from './account/copy'

export interface WindowTab {
  id: AccountTab
  label: string
  short: string
  icon: typeof Globe
  owner?: true
}

const OWN: WindowTab[] = [
  { id: 'sites', label: copy.tabs.sites, short: copy.short.sites, icon: Globe, owner: true },
  { id: 'keys', label: copy.tabs.keys, short: copy.short.keys, icon: KeyRound, owner: true },
  { id: 'people', label: copy.tabs.people, short: copy.short.people, icon: Users, owner: true },
  { id: 'profile', label: copy.tabs.profile, short: copy.short.profile, icon: CircleUser },
]

/** The tabs this person's window has: an owner's four, a viewer's Account alone. */
export const tabsFor = (viewer: boolean) => OWN.filter((t) => !(t.owner && viewer))

/** The window's tabs for this person, and the one to open. */
export function useWindowTabs(asked: AccountTab) {
  const tabs = tabsFor(isViewer())
  const tab = tabs.some((t) => t.id === asked) ? asked : 'profile'
  return { tabs, tab }
}
