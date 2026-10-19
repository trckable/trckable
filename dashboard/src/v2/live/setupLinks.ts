// Where each "Set up" on Live's cards goes: one table, built from the app's own openers (the settings dialog at a
// section, Explore at a table), so no card writes an address by hand. A figure with no entry here has nothing to set
// up and says so in words instead.
import { crawlerSetupAsked } from '../../features/crawlers/ask'
import type { Site } from '../../lib/api'
import { openSettings, type SettingsTab } from '../../lib/settings'
import { openExplore } from '../explore/open'
import type { Tab } from '../explore/sections'

export type LiveSetup = 'speed' | 'crawlers'

type Link = { kind: 'settings'; tab: SettingsTab; focus: string; want?: string } | { kind: 'explore'; tab: Tab }

/** Speed is the "Loading speed" switch under What the script records; AI crawlers are connected from AI & Search, where the connect sheet opens. */
export const SETUP_LINKS: Record<LiveSetup, Link> = {
  speed: { kind: 'settings', tab: 'site', focus: 'script-records', want: 'vitals' },
  crawlers: { kind: 'explore', tab: 'ai' },
}

export function runSetup(site: Site, id: LiveSetup) {
  const link = SETUP_LINKS[id]
  if (link.kind === 'settings') {
    openSettings(site, link.tab, { focus: link.focus, ...(link.want ? { want: link.want } : {}) })
    return
  }
  if (id === 'crawlers') crawlerSetupAsked()
  openExplore(link.tab)
}
