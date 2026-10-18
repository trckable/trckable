// The settings dialog, and the address that names one of its sections (?settings=alerts: a link, a reload) opening it.
import { useEffect } from 'react'
import type { Site } from '../lib/api'
import { toast } from '../components/toastBus'
import { errorCopy } from '../lib/errorCopy'
import { can } from '../lib/permissions'
import { closeSettings, openSettings, settingsInAddress, useSettings } from '../lib/settings'
import { routeOf } from './subpage'

/** The open settings; a dashboard address with a section named opens it, once the sites are known. */
export function useSettingsAddress(sites: Site[] | null, path: string, params: URLSearchParams) {
  const open = useSettings()
  const named = settingsInAddress(params)
  useEffect(() => {
    if (!sites || !named) return
    // A viewer changes no settings: the section in the address is dropped, with a word, not left to open nothing.
    if (!can('site.settings')) {
      closeSettings()
      toast(errorCopy.denied, 'info')
      return
    }
    if (open) return
    const site = routeOf(sites, path).site
    if (site) openSettings(site, named, undefined, { replace: true })
  }, [sites, path, named, open])
  return open
}
