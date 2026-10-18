// The settings dialog, and the address that names one of its sections (?settings=alerts: a link, a reload) opening it.
import { useEffect } from 'react'
import type { Site } from '../lib/api'
import { openSettings, settingsInAddress, useSettings } from '../lib/settings'
import { routeOf } from './subpage'

/** The open settings; a dashboard address with a section named opens it, once the sites are known. */
export function useSettingsAddress(sites: Site[] | null, path: string, params: URLSearchParams) {
  const open = useSettings()
  const named = settingsInAddress(params)
  useEffect(() => {
    if (!sites || !named || open) return
    const site = routeOf(sites, path).site
    if (site) openSettings(site, named, undefined, { replace: true })
  }, [sites, path, named, open])
  return open
}
