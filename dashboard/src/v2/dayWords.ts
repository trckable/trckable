// A day as the header says it: "Fri 16 Oct", and "Sat 10 Oct – today" for a stretch that ends now.
import { tag } from '../i18n'
import { type ISODate, type Range } from '../lib/dates'
import { dateFmt } from '../lib/format'

export function dayWords(day: ISODate): string {
  const p = Object.fromEntries(dateFmt(tag ?? 'en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(new Date(day + 'T12:00:00Z')).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${p.month}`
}

export function rangeWords(r: Range, today: ISODate, todayWord = 'today'): string {
  if (r.from === r.to) return dayWords(r.from)
  return `${dayWords(r.from)} – ${r.to === today ? todayWord : dayWords(r.to)}`
}
