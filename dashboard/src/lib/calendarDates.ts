// What only the calendar needs: typed dates and the month grid. Apart from
// dates.ts so the first load does not carry them.
import { addDays, diffDays, endOfMonth, fromDate, monthShort, startOfMonth, toDate, weekday, type ISODate } from './dates'

/** Parse loose typed input: 2026-09-01, 9/1/2026, 1.9.2026, Sep 1 2026. */
export function parseLoose(s: string, today: ISODate): ISODate | null {
  s = s.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  let y: number, mo: number, d: number
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/))) [d, mo, y] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) [mo, d, y] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^([a-z]{3})[a-z]*\.? (\d{1,2}),? ?(\d{4})?$/i))) {
    const name = m[1].toLowerCase()
    mo = monthShort.findIndex((x) => x.toLowerCase() === name) + 1
    d = +m[2]
    y = m[3] ? +m[3] : +today.slice(0, 4)
  } else return null
  if (y < 100) y += 2000
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return mo >= 1 && mo <= 12 && fromDate(toDate(iso)) === iso ? iso : null
}

/** Weeks of a month for the calendar grid, Monday first; null = padding. */
export function monthGrid(month: ISODate): (ISODate | null)[][] {
  const first = startOfMonth(month)
  const days = diffDays(first, endOfMonth(first)) + 1
  const cells: (ISODate | null)[] = new Array<ISODate | null>(weekday(first)).fill(null)
  for (let i = 0; i < days; i++) cells.push(addDays(first, i))
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
