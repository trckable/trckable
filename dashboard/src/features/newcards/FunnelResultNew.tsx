// A funnel's result: the line on top ("6.3% made it · 52s median"), then one bar
// a step, its length its share of the first step and its count beside it, and
// between two steps what was lost there.
import { fmtDuration, fmtInt, fmtPct } from '../../lib/format'
import type { FunnelResult } from '../../lib/api'
import { newCopy } from './copy'
import { funnelOf } from './funnelModel'
import './newcards.css'

export function FunnelResultNew({ res }: { res: FunnelResult[] }) {
  const f = funnelOf(res)
  if (!f) return null
  const c = newCopy.funnel
  const time = fmtDuration(f.seconds)
  return (
    <div className="fn">
      <p className="fn-result num">
        <b>{c.made(f.made)}</b>
        {f.seconds > 0 && <span>{` · ${f.exact ? c.median(time) : c.typical(time)}`}</span>}
      </p>
      {f.steps.map((s, i) => (
        <div key={i} className="fn-step">
          {s.loss && (
            <p className="fn-loss num faint">
              <span aria-hidden="true" />
              {c.lost(s.loss.pct, fmtInt(s.loss.left))}
            </p>
          )}
          <div className="fn-row">
            <span className="fn-name">{s.value}</span>
            <span className="fn-count num">{fmtInt(s.visitors)}</span>
          </div>
          <span className="fn-line" aria-hidden="true">
            <i style={{ width: `${Math.max(0.6, s.bar * 100)}%` }} title={fmtPct(s.bar)} />
          </span>
        </div>
      ))}
    </div>
  )
}
