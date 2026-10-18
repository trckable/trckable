// What a figure with nothing behind it shows on Live: a small figure, one plain line, and "Set up" (which opens the
// settings that fill it) for someone who can change settings, or a dash for someone who cannot.
import { Figure } from '../../figures/Figure'
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { openSettings, type SettingsTab } from '../../lib/settings'
import { copy } from './copy'

interface Props {
  site: Site
  line: string
  setup: SettingsTab
  /** True while the figure is still being read: nothing is said yet. */
  waiting: boolean
}

export function EmptyBlock({ site, line, setup, waiting }: Props) {
  if (waiting) return <div className="lhempty" aria-busy="true" />
  return (
    <div className="lhempty">
      <Figure name="lamp" className="lhart" minWidth={0} />
      <div className="lhtext">
        <span>{line}</span>
        {can('site.settings') ? (
          <button type="button" className="lhgo" onClick={() => openSettings(site, setup)}>
            {copy.health.setUp}
          </button>
        ) : (
          <span className="lhquiet">—</span>
        )}
      </div>
    </div>
  )
}
