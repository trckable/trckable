// What a goal row is made of, on a card and in the menu alike: the tinted chip, the trend and the number.
import { ArrowDown, ArrowUp, CircleCheck, FileText, Filter } from 'lucide-react'
import type { ComponentType } from 'react'
import { fmtInt, fmtPct } from '../../lib/format'
import { copy } from './copy'
import type { Change, GoalRow, Kind } from './model'

// The one place a kind picks its icon.
const ICON: Record<Kind, ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>> = { goal: CircleCheck, form: FileText, funnel: Filter }

export function GoalChip({ kind, size = 16 }: { kind: Kind; size?: number }) {
  const Icon = ICON[kind]
  return (
    <span className={`gc-chip k-${kind}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.9} aria-hidden={true} />
    </span>
  )
}

export const amountText = (r: GoalRow) => (r.unit === 'rate' ? fmtPct(r.amount) : fmtInt(r.amount))

/** The arrow and the percent; nothing where there is no comparison. */
export function Trend({ change }: { change: Change | null }) {
  if (!change) return null
  if (change.dir === 'flat') return <span className="gc-tr">{`${change.pct}%`}</span>
  const Arrow = change.dir === 'up' ? ArrowUp : ArrowDown
  return (
    <span className={`gc-tr ${change.dir}`}>
      <Arrow size={12} strokeWidth={2.2} aria-hidden={true} />
      <span className="sr">{copy.dir(change.dir === 'up')} </span>
      {`${change.pct}%`}
    </span>
  )
}
