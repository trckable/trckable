// A funnel's result: the line on top ("6.3% made it · 52s median"), then the
// steps as a vertical funnel (charts/FunnelRows): a bar a step, its width its
// share of the first step, and what was lost between two steps.
import { FunnelRows, type FunnelRow } from '../../charts/FunnelRows'
import { fmtDuration, fmtInt, fmtPct } from '../../lib/format'
import type { FunnelResult } from '../../lib/api'
import { deepCopy } from './deepCopy'
import { funnelOf } from './funnelModel'
import './deep.css'

export function FunnelResult({ res }: { res: FunnelResult[] }) {
  const f = funnelOf(res)
  if (!f) return null
  const c = deepCopy.funnel
  const time = fmtDuration(f.seconds)
  const rows = f.steps.map((s): FunnelRow => {
    const row = { label: s.value, count: fmtInt(s.visitors), share: s.bar }
    return s.loss ? { ...row, of: fmtPct(s.rate), drop: c.lost(s.loss.pct, fmtInt(s.loss.left)) } : row
  })
  return (
    <div className="fn">
      <p className="fn-result num">
        <b>{c.made(f.made)}</b>
        {f.seconds > 0 && <span>{` · ${f.exact ? c.median(time) : c.typical(time)}`}</span>}
      </p>
      <FunnelRows rows={rows} color="var(--accent)" label={c.label} />
    </div>
  )
}
