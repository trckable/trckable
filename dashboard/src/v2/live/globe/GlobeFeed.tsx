// The recent pageviews and events beside the globe: flag, page or event, how long ago. New rows slide in at the top and
// older ones fade. The rows are the ones "On the site right now" holds, so both lists name the same people.
import { useMemo } from 'react'
import type { Row } from '../../../features/live/model'
import { copy as liveCopy } from '../../../features/live/copy'
import { useLeaving } from '../../../features/live/useLeaving'
import { useArrivals } from '../useArrivals'
import { copy } from '../copy'
import { agoOf } from './geo'
import { Flag } from '../../ui/Flag'

const SHOWN = 14

const textOf = (r: Row): string => {
  if (r.kind === 'goal') return liveCopy.goal(r.label || (r.goal ?? ''))
  return r.kind === 'active' ? copy.still : (r.path ?? '/')
}

export function GlobeFeed({ rows, clock, active, onPick }: { rows: Row[]; clock: number; active: string | null; onPick: (r: Row) => void }) {
  const top = useMemo(() => rows.slice(0, SHOWN), [rows])
  const marks = useArrivals(top.map((r) => r.key))
  const list = useLeaving(top)
  return (
    <div className="gfeed">
      {list.length === 0 && <p className="mk-quiet gempty">{copy.nobody}</p>}
      {list.map((r, i) => {
        const a = agoOf(clock - r.last)
        return (
          <button key={r.key} type="button" className={`lv ${r.leaving ? 'leaving' : (marks.get(r.key) ?? '')}${active === r.key ? ' on' : ''}`.trim()} style={{ opacity: Math.max(0.3, 1 - i * 0.055) }} disabled={r.leaving} onClick={() => onPick(r)}>
            <span className="gcc"><Flag code={r.country ?? ''} /></span>
            <span className="pg mono" title={textOf(r)}>{textOf(r)}</span>
            <span className="src">{a.unit === 's' ? copy.agoSec(a.n) : copy.agoMin(a.n)}</span>
          </button>
        )
      })}
    </div>
  )
}
