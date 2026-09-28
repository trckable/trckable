// The account window's tabs: Sites, API keys, People and Account. A viewer
// has no API keys or People tab: asked for one, they land on their own
// account.
import { CircleUser, Globe, KeyRound, Users } from 'lucide-react'
import { useEffect } from 'react'
import type { AccountTab } from '../lib/account'
import { isViewer } from '../lib/me'
import { copy } from './account/copy'

export interface WindowTab {
  id: AccountTab
  label: string
  icon: typeof Globe
  owner?: true
}

const OWN: WindowTab[] = [
  { id: 'sites', label: copy.tabs.sites, icon: Globe },
  { id: 'keys', label: copy.tabs.keys, icon: KeyRound, owner: true },
  { id: 'people', label: copy.tabs.people, icon: Users, owner: true },
  { id: 'profile', label: copy.tabs.profile, icon: CircleUser },
]

/** The window's tabs for this person, and the one to open. */
export function useWindowTabs(asked: AccountTab) {
  const viewer = isViewer()
  const tabs = OWN.filter((t) => !(t.owner && viewer))
  const tab = tabs.some((t) => t.id === asked) ? asked : 'profile'
  // On a phone the tabs are one row that scrolls: the open one is in view.
  useEffect(() => {
    document.querySelector('.account-nav [aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [tab])
  return { tabs, tab }
}
