// The two small rules the dashboard's first load needs (the menu's dot, the
// key sent to the server), apart from the words the timeline and moment use.
import type { Milestone } from '../../lib/api'

/** The key the server knows a milestone by. */
export const keyOf = (m: Pick<Milestone, 'kind' | 'step'>): [string, string] => [m.kind, m.step]

/** Whether the menu shows a dot: something stored since the timeline was
 *  last opened, other than the moment on screen. */
export function hasDot(list: Milestone[], openedAt: number, moment: Milestone | null): boolean {
  return list.some((m) => m.created_at > openedAt && !(moment && m.kind === moment.kind && m.step === moment.step))
}
