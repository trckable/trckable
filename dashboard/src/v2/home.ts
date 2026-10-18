// Home, what the logo goes to: the current site's Live (the setup screen when the site is not verified yet, which Live gives
// way to by itself), or All sites when no site is in view. Anything open on the way (a sheet, the settings, Explore's panel,
// the filters) is closed, since the address carries the rest.
import type { Site } from '../lib/api'
import { closeSettings } from '../lib/settings'
import { rememberTab } from '../lib/tab'
import { navigate } from '../lib/url'
import { closeSheets } from './ui/useSheet'

export function goHome(site: Site | null) {
  closeSheets()
  closeSettings()
  if (site) rememberTab('live')
  navigate(site ? `/${encodeURIComponent(site.domain)}?view=live` : '/sites')
}
