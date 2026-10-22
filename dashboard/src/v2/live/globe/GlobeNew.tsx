// "New visitors": the latest arrivals as a small floating card over the full-screen globe. Newest on top, each enters
// smoothly and the oldest slips out; a click focuses that visitor's pin and opens their card.
import { useMemo } from 'react'
import { Avatar } from '../../../components/visitor/Avatar'
import { countryName, flag } from '../../../lib/format'
import { nameOf } from '../../../lib/visitor'
import type { Row } from '../../../features/live/model'
import { useLeaving } from '../../../features/live/useLeaving'
import { useArrivals } from '../useArrivals'
import { copy } from '../copy'
import { agoOf } from './geo'

const SHOWN = 5
/** Under this many seconds a visitor "just" came in. */
const JUST_S = 10

const whenOf = (ms: number): string => {
  const a = agoOf(ms)
  if (a.unit === 's') return a.n < JUST_S ? copy.justNow : copy.agoSec(a.n)
  return copy.agoMin(a.n)
}

export function GlobeNew({ rows, clock, onPick }: { rows: Row[]; clock: number; onPick: (r: Row) => void }) {
  // Visitors with a place come first on the globe, but anyone can be listed.
  const top = useMemo(() => rows.slice(0, SHOWN), [rows])
  const marks = useArrivals(top.map((r) => r.key))
  const list = useLeaving(top)
  if (list.length === 0) return null
  return (
    <aside className="gnew" aria-label={copy.newVisitors}>
      <h3>{copy.newVisitors}</h3>
      {list.map((r) => (
        <button key={r.key} type="button" className={`gnv ${r.leaving ? 'leaving' : (marks.get(r.key) ?? '')}`.trim()} disabled={r.leaving} onClick={() => onPick(r)}>
          {r.visitor ? <Avatar id={r.visitor} size={28} /> : <span className="gnf" aria-hidden="true">{flag(r.country ?? '')}</span>}
          <span className="gnt">
            <b>{r.visitor ? nameOf(r.visitor) : (r.city || countryName(r.country ?? ''))}</b>
            <span className="mk-quiet">
              {r.country && <span aria-hidden="true">{flag(r.country)} </span>}
              {r.city ? `${r.city} · ` : ''}
              <span className="mono">{r.kind === 'goal' ? (r.label || r.goal) : (r.path ?? '/')}</span>
            </span>
          </span>
          <span className="mk-quiet gna">{whenOf(clock - r.last)}</span>
        </button>
      ))}
    </aside>
  )
}
