// What a figure with nothing behind it shows on Live: a small figure, one plain line, and, where there is something to
// switch on, "Set up" (which goes to exactly that, see setupLinks) for someone who can change settings. A figure with
// nothing to set up, or a reader who cannot change settings, gets the line alone.
import { Figure } from '../../figures/Figure'
import type { Site } from '../../lib/api'
import { can } from '../../lib/permissions'
import { copy } from './copy'
import { runSetup, type LiveSetup } from './setupLinks'

interface Props {
  site: Site
  line: string
  /** What "Set up" opens; none when nothing needs setting up. */
  setup?: LiveSetup
  /** True while the figure is still being read: nothing is said yet. */
  waiting: boolean
  /** The height (px) kept while it is read, so what lands does not move what is beside it. */
  reserve?: number
}

export function EmptyBlock({ site, line, setup, waiting, reserve = 0 }: Props) {
  if (waiting) return <div className="lhempty" aria-busy="true" style={{ minHeight: reserve }} />
  return (
    <div className="lhempty">
      <Figure name="lamp" className="lhart" minWidth={0} />
      <div className="lhtext">
        <span>{line}</span>
        {setup && can('site.settings') && (
          <button type="button" className="lhgo" onClick={() => runSetup(site, setup)}>
            {copy.health.setUp}
          </button>
        )}
      </div>
    </div>
  )
}
