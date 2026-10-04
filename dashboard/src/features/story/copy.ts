// Replay as a story: the pops on the timeline and the card at its end. What
// moves to the message files when translations come.
import { fmtInt } from '../../lib/format'
import { defineCopy } from '../../i18n'

export const copy = defineCopy('story', {
  spike: (factor: string) => `Traffic ${factor}`,
  newTraffic: (visitors: number) => `New traffic · ${visitors === 1 ? '1 visitor' : `${fmtInt(visitors)} visitors`}`,
  from: (who: string) => `from ${who}`,
  sale: (n: number) => (n === 1 ? 'Sale' : `${n} sales`),
  country: (name: string) => `First visitor from ${name}`,
  ai: (bot: string) => `First AI assistant visit · ${bot}`,
  milestone: (what: string) => `Milestone · ${what}`,
  note: 'Note',
  moments: 'Moments in this period',
  jumpTo: (what: string, when: string) => `${when}: ${what}. Jump there`,
  prev: 'Previous moment (←)',
  next: 'Next moment (→)',
  stop: 'Stop replay (Esc)',
  // The card at the end.
  visitors: (n: string) => `${n} visitors`,
  bestHour: (h: string) => `best hour ${h}`,
  bestDay: (d: string) => `best day ${d}`,
  topSource: (s: string) => `top source ${s}`,
  sales: (n: number) => (n === 1 ? '1 sale' : `${n} sales`),
  share: 'Share',
  again: 'Replay again',
  close: 'Close',
  summary: 'Replay summary',
})
