// What the address bar does once the dashboard has booted: an old /settings link opens that site's settings over its
// dashboard, and an address that names none of this person's sites goes to their main dashboard.
import { useEffect } from 'react'
import { routeOf } from '../features/subpage'
import type { Site } from './api'
import { namesSite } from './landing'
import { keepSignInReturn } from './returnTo'
import { openSettings, settingsTarget } from './settings'
import { leaveStray } from './stray'
import { navigate } from './url'

type Where = { state: string; sites: Site[]; gated: boolean; path: string; params: URLSearchParams; shared: boolean }

export function useBootAddress({ state, sites, gated, path, params, shared }: Where) {
  // An old /settings?site=…&tab=… link (the docs, a bookmark) opens that site's settings over its dashboard; the page
  // itself is gone, and any other /settings address falls through to the main dashboard.
  useEffect(() => {
    if (state !== 'ready' || gated || path !== '/settings') return
    const s = sites.find((x) => x.id === params.get('site'))
    if (!s) return
    const { tab, extra } = settingsTarget(params.get('tab'))
    openSettings(s, tab, params.get('visitor') ? { ...extra, visitor: params.get('visitor') ?? '' } : extra, { replace: true })
  }, [state, sites, gated, path, params])

  // Keep the address bar honest about the screen shown.
  useEffect(() => {
    if (shared) return
    if (state === 'setup' && path !== '/setup') navigate('/setup' + location.hash, { replace: true })
    if (keepSignInReturn(state, path, gated)) return
    // Signed in at the root, or at an address that names none of this person's sites (a typo, someone else's site, one since
    // removed): their main dashboard, never a page made up for an address it does not know. No site at all (and the first run
    // skipped): the empty page stays at this address, nothing to go to.
    if (state === 'ready' && !gated && sites.length > 0 && !(path === '/settings' && namesSite(sites, params)) && path !== '/sites') leaveStray(sites, path, routeOf(sites, path))
  }, [state, sites, path, shared, gated, params])
}
