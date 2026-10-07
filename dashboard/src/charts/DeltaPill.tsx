// ▲ 12% or ▼ 8% against the period before; nothing when there is nothing to compare with.
import { moveOf } from './change'
import { kitCopy } from './copy'

export function DeltaPill({ now, was }: { now: number; was: number | undefined }) {
  const m = moveOf(now, was)
  if (!m) return <span className="bl-chg num" aria-hidden="true" />
  if (m.dir === 'flat') return <span className="bl-chg num">{kitCopy.flat}</span>
  return (
    <span className={`bl-chg num ${m.dir}`} title={`${m.dir === 'down' ? '−' : '+'}${m.pct}%`}>
      {`${m.dir === 'up' ? kitCopy.up : kitCopy.down} ${m.pct}%`}
    </span>
  )
}
