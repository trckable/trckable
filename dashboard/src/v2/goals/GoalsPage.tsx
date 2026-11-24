// The Goals tab: the list of goals, or one goal's own page when the address names it.
import type { XCtx } from '../explore/ctx'
import { GoalPage } from './GoalPage'
import { GoalsList } from './GoalsList'

export function GoalsPage({ x }: { x: XCtx }) {
  const goal = x.view.xg
  return goal ? <GoalPage key={goal} x={x} goal={goal} /> : <GoalsList x={x} />
}
