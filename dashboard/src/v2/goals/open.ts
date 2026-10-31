// Where a goal row leads: Explore, on the table that holds goals and funnels, narrowed to the goal.
import { openExplore } from '../explore/open'
import type { GoalRow } from './model'

export function openRow(r: GoalRow) {
  openExplore('funnels', r.kind === 'funnel' ? undefined : [{ dim: 'goal', value: r.value }])
}
