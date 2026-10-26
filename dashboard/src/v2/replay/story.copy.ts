// The words of the replay: the moments it tells, the wrap-up line and its buttons.
import { defineCopy } from '../../i18n'
import { fmtInt } from '../../lib/format'

const people = (n: number) => (n === 1 ? '1 person' : `${fmtInt(n)} people`)

export const copy = defineCopy('replay', {
  firstVisit: 'First visit',
  jump: (from: number, to: number) => `Up from ${from} to ${to}`,
  best: (bucket: string, n: number) => `Busiest ${bucket === 'hour' ? 'hour' : 'day'}: ${people(n)}`,
  firstSale: (amount: string) => `First sale ${amount}`,
  peopleWord: (n: number) => (n === 1 ? 'person' : 'people'),
  /** "By 23:33: 1,234 people, best hour 17:00, from Google". */
  wrap: (by: string, n: string, best: string, source?: string) => `${by}: ${n} ${n === '1' ? 'person' : 'people'}${best ? `, ${best}` : ''}${source ? `, from ${source}` : ''}`,
  by: (clock: string) => `By ${clock}`,
  bestHour: (h: string) => `best hour ${h}`,
  bestDay: (d: string) => `best day ${d}`,
  dialog: 'Replay',
  pause: 'Pause',
  play: 'Play',
  skip: 'Skip',
  again: 'Replay again',
  share: 'Share',
  close: 'Close',
})
