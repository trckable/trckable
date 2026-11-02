// The funnel as one shape, and the goals under it as rings.
import { fmtPct } from '../../lib/format'
import { copy } from '../explore/copy'
import type { Funnel, Goal, Step } from '../explore/types'
import { FunnelShape } from './FunnelShape'
import { copy as exCopy } from '../explore/copy'
import { GoalRing } from './GoalRing'

export function XMiniFunnel({ steps, leak, ghost, leakPage, onLeak, onConnect }: { steps: Step[]; leak: Funnel['leak']; ghost: boolean; leakPage?: string; onLeak?: () => void; onConnect?: () => void }) {
  const at = leak.at > 0 ? steps[leak.at] : undefined
  return (
    <div className="mf">
      <FunnelShape steps={steps} label={copy.funnel} red={leak.at} ghost={ghost ? copy.paid : undefined} />
      {at && <div className="mfd">{copy.goesOn(fmtPct(at.v / (steps[leak.at - 1].v || 1)), fmtPct(leak.ur))}{onLeak && leakPage && <button type="button" className="xb xleak" data-xleak="1" onClick={onLeak}>{exCopy.seePage(leakPage)} {'›'}</button>}</div>}
      {ghost && (
        <div className="mfn">
          {onConnect && (
            <button type="button" className="lk3" onClick={onConnect}>
              {copy.connectRevenue}
            </button>
          )}
          {copy.toSeeWhoPaid}
        </div>
      )}
    </div>
  )
}

export function XGoals({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null
  const max = Math.max(1, ...goals.flatMap((g) => [g.v, g.hi]))
  return (
    <div className="grs">
      {goals.map((g) => (
        <GoalRing key={g.name} g={g} max={max} />
      ))}
    </div>
  )
}
