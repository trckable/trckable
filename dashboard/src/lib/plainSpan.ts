// How long something lasted, in the words people use: 12 min, 3 h 5 min, 1 day 22 h. The one place every
// "down for" text takes its span from, so a long outage never reads as thousands of minutes.
import { defineCopy } from '../i18n'

const words = defineCopy('plainSpan', {
  min: (m: number) => `${m} min`,
  hours: (h: number, m: number) => (m ? `${h} h ${m} min` : `${h} h`),
  days: (d: number, h: number) => `${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`,
})

/** Seconds as a span: whole minutes under an hour (at least 1), hours and minutes under a day, days and hours beyond. */
export function plainSpan(secs: number): string {
  const m = Math.max(1, Math.round(Math.max(0, secs) / 60))
  if (m < 60) return words.min(m)
  const h = Math.floor(m / 60)
  if (h < 24) return words.hours(h, m % 60)
  return words.days(Math.floor(h / 24), h % 24)
}
