// The header's site card: which site, and that site's settings, as one
// control with a thin divider between (the cog belongs to the name beside it).
import { Settings as Cog } from 'lucide-react'
import { SitePicker } from '../../components/SitePicker'
import type { Site } from '../../lib/api'
import { canChange } from '../../lib/me'
import { openSettings } from '../../lib/settings'
import { copy } from './copy'

export function SiteZone({ sites, current, all }: { sites: Site[]; current: Site | null; all?: boolean }) {
  const settings = current && canChange() ? current : null
  return (
    <div className="site-zone">
      <SitePicker sites={sites} current={current} all={all} />
      {settings && <span className="site-sep" aria-hidden="true" />}
      {settings && (
        <button type="button" className="btn icon ghost gear" aria-label={copy.settingsFor(settings.domain)} title={copy.settingsFor(settings.domain)} onClick={() => openSettings(settings)}>
          {/* A cog, with teeth. It used to be a circle with rays, which is a
              sun — so the one button that opens a site's settings looked like
              a light/dark switch. */}
          <Cog size={19} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
