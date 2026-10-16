// The funnel as bars, one a step, with the step where people leave more than usual in red; and the goals under it, each a
// number against the range it usually sits in.
import { Fragment } from 'react'
import { fmtInt, fmtPct } from '../../lib/format'
import { copy } from '../explore/copy'
import type { Funnel, Goal, Step } from '../explore/types'
import { Rng } from './RangeBar'

export function XMiniFunnel({ steps, leak, ghost, onConnect }: { steps: Step[]; leak: Funnel['leak']; ghost: boolean; onConnect: () => void }) {
  const first = steps[0]?.v || 1
  return (
    <div className="mf">
      {steps.map((s, i) => {
        const hot = i > 0 && i === leak.at
        return (
          <Fragment key={s.name}>
            {hot && <div className="mfd">{copy.goesOn(fmtPct(s.v / (steps[i - 1].v || 1)), fmtPct(leak.ur))}</div>}
            <div className="mfr">
              <span>{s.name}</span>
              <div className="mb">
                <i className={hot ? 'red' : ''} style={{ width: `${Math.max(3, (s.v / first) * 100)}%` }} />
              </div>
              <b>{fmtInt(s.v)}</b>
            </div>
          </Fragment>
        )
      })}
      {ghost && (
        <>
          <div className="mfr ghost">
            <span>{copy.paid}</span>
            <div className="mb" />
            <b>{'–'}</b>
          </div>
          <div className="mfn">
            <button type="button" className="lk3" onClick={onConnect}>
              {copy.connectRevenue}
            </button>
            {copy.toSeeWhoPaid}
          </div>
        </>
      )}
    </div>
  )
}

export function XGoals({ goals }: { goals: Goal[] }) {
  return (
    <>
      {goals.map((g) => (
        <div key={g.name} className={`mk-goal ${g.st}`}>
          <span className="gn">{g.name}</span>
          <Rng v={g.v} lo={g.lo} hi={g.hi} max={Math.max(g.v, g.hi, 1) * 1.3} />
          <span className="gv" style={g.st === 'dn' ? { color: 'var(--mk-red)' } : undefined}>
            {fmtInt(g.v)}
          </span>
        </div>
      ))}
    </>
  )
}
