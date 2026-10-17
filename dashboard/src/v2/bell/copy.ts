// The bell's words.
import { defineCopy } from '../../i18n'
import { fmtInt } from '../../lib/format'

const clock = (at: number) => new Date(at * 1000).toISOString().slice(11, 16)

export const copy = defineCopy('bell', {
  title: 'Notifications',
  markAll: 'Mark all read',
  settings: 'Alert settings',
  none: 'Nothing yet. Alerts, mentions and milestones land here.',
  stopped: (d: string) => `${d} stopped answering`,
  noAnswerSince: (at: number) => `No answer since ${clock(at)}`,
  backUp: (d: string) => `${d} is back up`,
  wasDown: (min: number) => `It was down for ${min} minutes`,
  mention: (host: string) => `New mention on ${host}`,
  milestone: (kind: string, value: number) => (kind === 'visitors' ? `You passed ${fmtInt(value)} visitors` : `Milestone: ${fmtInt(value)} ${kind}`),
  milestoneSub: 'Milestone',
  menu: 'Notifications',
})
