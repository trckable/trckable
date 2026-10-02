// Card 2's first tab, what they did: the goals they reached.
import { BarList, type BarItem } from '../../charts/BarList'
import { EmptyState } from '../../components/EmptyState'
import { cardCopy } from './copy'
import type { CardsCtx } from './ctx'
import { priorOf } from './prior'

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
      <BarList
        dimLabel={cardCopy.goal}
        subLabel={cardCopy.conv}
        loading={c.loading}
        barColor="var(--accent)"
        whole={c.visitors}
        prior={priorOf(c.prev, 'goal')}
        onPick={(v) => c.addFilter('goal', v)}
        items={(c.scrubbing ? [] : c.goals).slice(0, c.rows).map(
          (r): BarItem => ({ key: r.value, label: <span className="num">{r.value}</span>, title: r.value, value: r.visitors, sub: c.visitors ? r.visitors / c.visitors : 0 }),
        )}
      />
    </>
  )
}
