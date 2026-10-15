// The header's site: its avatar with a small seal when something independent vouches for its numbers, and its
// name as the one control that opens the site list. The site's settings are the first row of that list; the
// settings key still has a button to press, out of sight and out of the tab order.
import { SitePicker } from '../../components/SitePicker'
import type { Site } from '../../lib/api'
import { canChange } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { VerifiedPill } from '../verified/VerifiedPill'
import { copy } from './copy'

export function SiteZone({ sites, current, all }: { sites: Site[]; current: Site | null; all?: boolean }) {
  const settings = current && canChange() ? current : null
  return (
    <div className="site-zone">
      <SitePicker sites={sites} current={current} all={all} />
      {current && !all && <VerifiedPill verified={current.verified} site={current} seal />}
      {settings && <button type="button" className="sr" data-key="settings" tabIndex={-1} aria-hidden="true" onClick={() => openSettings(settings)}>{copy.settingsFor(settings.domain)}</button>}
    </div>
  )
}
