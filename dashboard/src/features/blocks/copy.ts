import { defineCopy } from '../../i18n'
import { fmtInt } from '../../lib/format'

export const copy = defineCopy('blocks', {
  explore: 'Open in Explore',
  uptime: (pct: string) => `${pct} up`,
  noIncidents: 'No downtime in this period.',
  ongoing: 'Still going',
  down: 'Down',
  quiet: 'Quiet',
  lasted: (d: string) => `for ${d}`,
  noMentions: 'No mentions in this period.',
  noRows: 'Nothing to rank in this period.',
  visitors: (n: number) => `${fmtInt(n)} ${n === 1 ? 'visitor' : 'visitors'}`,
  was: (v: string) => `was ${v}`,
  chart: (title: string, from: string, to: string) => `${title}, from ${from} to ${to}`,
})
