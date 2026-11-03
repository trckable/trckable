// What the busy moment says: the card that comes up in the corner (SurgeCard), and its source and page again in the
// tip on the chart (Where, SurgeBand). The people on the site
// with how many times the usual as a chip, the last hour in small, and where it came from: the source with its
// icon and how many more than usual, and the page it landed on.
import { fmtInt } from '../../lib/format'
import { RefMark } from '../cards/refIcons'
import { Rolling } from '../moments/Rolling'
import { signals } from './copy'
import { BusySpark } from './BusySpark'
import { busyCount, midTruncate, sourceExtra, sourceHost, surgeChip, type Surge } from './surge'
import { useHostIcon } from './useHostIcon'
import './busy.css'

const t = signals.surge

/** The live dot: it pulses while the moment lasts. */
export const BusyDot = ({ live }: { live: boolean }) => <i className="bz-dot" data-live={live ? '1' : undefined} aria-hidden="true" />

export function BusyBody({ surge }: { surge: Surge }) {
  return (
    <div className="bz bz-card">
      <div className="bz-hero">
        <b className="bz-count">
          <Rolling to={busyCount(surge)} fmt={fmtInt} />
        </b>
        <span className="bz-unit">{surge.ended ? t.peoplePeak : t.onSite}</span>
        <span className="sg-chip bz-chip">{surgeChip(surge)}</span>
      </div>
      <BusySpark surge={surge} />
      <Where surge={surge} />
    </div>
  )
}

export function Where({ surge }: { surge: Surge }) {
  const host = sourceHost(surge)
  const icon = useHostIcon(host)
  const { source, source_n: n, page } = surge.why
  const extra = sourceExtra(surge)
  if (!source && !page) return null
  return (
    <div className="bz-where">
      {source && (
        <p className="bz-source">
          {host && <RefMark host={host} icon={icon} />}
          <span className="bz-src-name">{source}</span>
          {!!n && (
            <i className="bz-bar" aria-hidden="true">
              <b style={{ width: `${Math.min(100, Math.round((n * 100) / Math.max(surge.online, 1)))}%` }} />
            </i>
          )}
          {extra > 0 && <span className="bz-plus">+{fmtInt(extra)}</span>}
        </p>
      )}
      {page && (
        <code className="bz-page" title={page}>
          {midTruncate(page)}
        </code>
      )}
    </div>
  )
}
