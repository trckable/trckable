// The alert a notice came from, and turning that alert off or on for one site. One place: the bell's "Mute this for this
// site" and a pause asked of Peek both go through `setAlertOn`, the same alert rows Settings → Alerts edits.
import { more } from '../../lib/apiMore'
import type { AlertKind, Notice, NoticeKind } from './notices'

const OF_KIND: Partial<Record<NoticeKind, AlertKind>> = { down: 'stopped', up: 'stopped', spike: 'spike', sale: 'customer', weekly: 'weekly', milestone: 'milestone', mention: 'mention', answer: 'answer' }

/** The alert a notice came from: the one it names, else its kind's own; none for a notice no alert makes (a plan, a team, a setup reminder). */
export const alertOf = (n: Pick<Notice, 'kind' | 'alert'>): AlertKind | undefined => n.alert ?? OF_KIND[n.kind]

/** 'done': switched. 'same': it already was so. 'none': the site has no alert of that kind. */
export type Switched = 'done' | 'same' | 'none'

export async function setAlertOn(siteId: string, kind: AlertKind, on: boolean): Promise<Switched> {
  const same = (await more.alerts(siteId)).alerts.find((a) => a.kind === kind)
  if (!same) return 'none'
  if (same.enabled === on) return 'same'
  await more.saveAlert(siteId, { id: same.id, kind: same.kind, enabled: on, target: same.target, threshold: same.threshold, ...(same.metric ? { metric: same.metric } : {}), ...(same.period ? { period: same.period } : {}) })
  return 'done'
}
