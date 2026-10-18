// The bell's words.
import { defineCopy } from '../../i18n'
import { clock } from '../../lib/site'

const at24 = (at: number) => clock(new Date(at * 1000), '')

export const copy = defineCopy('bell', {
  title: 'Notifications',
  markAll: 'Mark all read',
  settings: 'Alert settings',
  none: 'Nothing yet. Alerts, mentions and milestones land here.',
  stopped: (d: string) => `${d} stopped answering`,
  noAnswerSince: (at: number) => `No answer since ${at24(at)}`,
  backUp: (d: string) => `${d} is back up`,
  wasDown: (min: number) => `It was down for ${min} minutes`,
  setupTitle: (d: string) => `${d} has no visits yet`,
  setupSub: 'Finish the install',
  mention: (host: string) => `New mention on ${host}`,
  milestoneSub: 'Milestone',
  menu: 'Notifications',
})
