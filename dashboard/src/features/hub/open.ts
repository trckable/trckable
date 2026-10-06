// What "Open" does for each place a feature lives. It leaves the pop-up first
// (the caller closes it), then goes there: a settings section or an account
// section, the dashboard in the right view, or a control the page already has
// (found by its data-key, as the shortcuts do).
import { openAccount } from '../../lib/account'
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { navigate, setView } from '../../lib/url'
import { openShortcuts } from '../../components/ShortcutsHost'
import { openAiSearch } from '../aisearch/open'
import type { Where } from './registry'

const home = (site: Site) => '/' + encodeURIComponent(site.domain)

/** The dashboard of a site, in the given view. */
function dashboard(site: Site, patch: Parameters<typeof setView>[0]) {
  if (location.pathname !== home(site)) navigate(home(site))
  setView(patch)
}

/** Presses the control that carries the shortcut's name, once the pop-up is gone and focus is back. */
const press = (key: string) =>
  setTimeout(() => {
    // Peek's button is the one with the key on it, and carries no data-key.
    const pick = key === 'ask' ? '.header-tools .btn.ask' : `[data-key="${key}"]`
    const el = [...document.querySelectorAll<HTMLElement>(pick)].find((b) => b.offsetParent !== null)
    el?.click()
  }, 60)

export function openWhere(w: Where, site: Site | undefined) {
  if (w.to === 'account') openAccount(w.tab)
  else if (w.to === 'shortcuts') openShortcuts()
  else if (w.to === 'all') navigate('/all')
  else if (w.to === 'press') press(w.key)
  else if (!site) return
  else if (w.to === 'settings') openSettings(site, w.tab)
  else if (w.to === 'ai') {
    if (location.pathname !== home(site)) navigate(home(site))
    openAiSearch(site)
  } else if (w.to === 'live') dashboard(site, { live: true })
  else dashboard(site, { mode: 'full' })
}

/** Whether a place needs a site to go to. */
export const needsSite = (w: Where): boolean => w.to === 'settings' || w.to === 'ai' || w.to === 'live' || w.to === 'full'
