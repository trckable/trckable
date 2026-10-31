// The goals and the first saved funnel, as up to four small cards under the Briefing's story: what was reached, and
// whether it is more or less than before. Real numbers only: the report the page already read, and the funnel it read.
import { CircleCheck } from 'lucide-react'
import type { Row } from '../../lib/api'
import { shows } from '../../lib/modules'
import { can } from '../../lib/permissions'
import { useMods } from '../../lib/useMods'
import { copy } from './copy'
import { cardRows, funnelRow, goalRows, type FunnelSteps, type GoalRow } from './model'
import { openRow } from './open'
import { amountText, changeText, GoalChip, Trend } from './parts'
import './goals.css'

interface Props {
  site: string
  goals: Row[] | null | undefined
  /** The period before; absent when the numbers are not compared. */
  before: Row[] | null | undefined
  funnel: FunnelSteps | null | undefined
  /** The funnel has been read (it may have been found to have nothing) and the page does not already ask for a first goal: until then the empty row waits. */
  read: boolean
  onGoal: () => void
}

function Card({ r }: { r: GoalRow }) {
  const text = amountText(r)
  return (
    <button type="button" className="gc" data-goal-card={r.kind} title={r.name} aria-label={copy.card(r.name, text, changeText(r.change))} onClick={() => openRow(r)}>
      <span className="gc-top">
        <GoalChip kind={r.kind} />
        <Trend change={r.change} />
      </span>
      <span className="gc-num num">{text}</span>
      <span className="gc-name">{r.name}</span>
    </button>
  )
}

export function GoalCards({ site, goals, before, funnel, read, onGoal }: Props) {
  const mods = useMods(site)
  if (!shows(mods, 'cards', 'goals')) return null
  const rows = cardRows(goalRows(goals, before), funnelRow(funnel, before !== undefined))
  if (rows.length === 0) {
    if (!read || !can('goal.create')) return null
    return (
      <button type="button" className="gc-empty" data-goal-cards-empty onClick={onGoal}>
        <span className="gc-chip k-goal" aria-hidden="true">
          <CircleCheck size={16} strokeWidth={1.9} aria-hidden={true} />
        </span>
        {copy.first}
      </button>
    )
  }
  return (
    <div className={`gcs n${rows.length}`} data-goal-cards>
      {rows.map((r) => (
        <Card key={r.key} r={r} />
      ))}
    </div>
  )
}
