// A page with no data because the site has had no visit yet: the desk lamp sweeping, one line, one hint.
import { Figure } from '../../figures/Figure'
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { openSettings } from '../../lib/settings'
import { waiting as t } from '../copy'

/** With a site, someone who may change its settings also gets the way to check the install. */
export function Waiting({ site }: { site?: Site }) {
  return (
    <div className="mk-waiting">
      <Figure name="lamp" minWidth={641} className="mk-waiting-fig" />
      <b>{t.title}</b>
      <span className="mk-quiet">{t.hint}</span>
      {site && can('site.settings') && (
        <button type="button" className="xb" onClick={() => openSettings(site, 'install')}>
          {t.check}
        </button>
      )}
    </div>
  )
}
