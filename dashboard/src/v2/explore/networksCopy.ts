// The Networks table's words: the internet providers people came through, how they convert and how fast pages load for them.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('v2networks', {
  head: 'Network',
  people: 'Visits',
  sales: 'Buy',
  goal: (goal: string) => `Reach ${goal}`,
  engaged: 'Stay',
  loads: 'Loads in',
  enough: (n: number) => `Conversion shows from ${n} visits.`,
  say: (slow: string, slowPct: string, fast: string, fastPct: string) => `Visitors on ${slow} convert at ${slowPct}, on ${fast} at ${fastPct}.`,
  sayStay: (slow: string, slowPct: string, fast: string, fastPct: string) => `Visitors on ${slow} stay at ${slowPct}, on ${fast} at ${fastPct}.`,
  none: 'Too few visits yet to compare networks.',
  note: 'Networks come from the visitor’s internet provider, and only on sites that keep region and city.',
  credit: 'Provider names by DB-IP',
})
