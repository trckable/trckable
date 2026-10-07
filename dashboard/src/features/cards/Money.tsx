// Card 2's first tab, what they did: the goals they reached.
import { EmptyState } from '../../components/EmptyState'
import { Loading } from '../../components/loading/Loading'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { GoalRows } from './GoalRows'

export function GoalsPanel({ c }: { c: CardsCtx }) {
  // Nothing to list: one line and the button that starts one, not an empty table.
  if (!c.loading && c.goals.length === 0) {
    return (
      <EmptyState line={cardCopy.noGoals} action={cardCopy.trackGoal} onAction={c.onTrackGoal} />
    )
  }
  return (
    <>
      <div className="tc-tools">
        <button type="button" className="btn ghost" onClick={c.onTrackGoal}>
          {cardCopy.trackGoal}
        </button>
      </div>
      {c.loading ? <Loading height={164} /> : <GoalRows c={c} />}
    </>
  )
}
