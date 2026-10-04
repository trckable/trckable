// How another language writes dates, days, months and decimals, through Intl.
// Only a page in another language loads this (index.ts hands it to the code that
// formats); English keeps its own forms in the code, so none of this is carried
// by the English first load. It imports lang.ts and nothing else.
import { tag } from './lang'

const format = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { ...o, timeZone: 'UTC' })
const short = { month: 'short', day: 'numeric' } as const
const utc = (iso: string) => new Date(iso + 'T00:00:00Z')
const names = (o: Intl.DateTimeFormatOptions, count: number, at: (i: number) => number) => Array.from({ length: count }, (_, i) => format(o).format(at(i)))

export default {
  monthShort: names({ month: 'short' }, 12, (i) => Date.UTC(2021, i, 1)),
  monthLong: names({ month: 'long' }, 12, (i) => Date.UTC(2021, i, 1)),
  // Monday first: the 4th of January 2021 was a Monday.
  dayShort: names({ weekday: 'short' }, 7, (i) => Date.UTC(2021, 0, 4 + i)),
  /** "Sa., 4. Okt. 2026" for 2026-10-04, with the weekday and the year when asked. */
  day: (iso: string, o: { weekday?: boolean; year?: boolean } = {}) => format({ ...short, weekday: o.weekday ? 'short' : undefined, year: o.year ? 'numeric' : undefined }).format(utc(iso)),
  /** "1.–4. Okt." */
  range: (from: string, to: string, year: boolean) => format({ ...short, year: year ? 'numeric' : undefined }).formatRange(utc(from), utc(to)),
  /** One label of the main chart's time axis (bucket labels: the hour, the day, the week, the month). */
  bucket: (t: string, bucket: string, long: boolean, weekOf: (day: string, year: number) => string) => {
    const d = new Date(t + ':00Z')
    const day = format(short).format(d)
    const hour = t.slice(11, 16)
    if (bucket === 'month') return format({ month: 'short', year: 'numeric' }).format(d)
    if (bucket === 'week') return long ? weekOf(day, d.getUTCFullYear()) : day
    const named = long ? format({ ...short, weekday: 'short' }).format(d) : day
    if (bucket === 'day') return named
    if (long) return `${named} · ${hour}`
    // Midnight names the day, so hours across several days say which.
    return hour === '00:00' ? day : hour
  },
  fixed: (x: number, digits: number) => x.toLocaleString(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  ratio: (x: number, max: number, min: number) => x.toLocaleString(tag, { style: 'percent', minimumFractionDigits: min, maximumFractionDigits: max }),
}
