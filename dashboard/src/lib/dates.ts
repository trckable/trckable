// Calendar math on plain "YYYY-MM-DD" strings. Dates are days in the site's
// timezone; we do arithmetic on UTC midnights so DST never shifts a day.

export type ISODate = string

const DAY = 86_400_000

export const toDate = (d: ISODate) => new Date(d + 'T00:00:00Z')
export const fromDate = (d: Date): ISODate => d.toISOString().slice(0, 10)
export const addDays = (d: ISODate, n: number) => fromDate(new Date(toDate(d).getTime() + n * DAY))
export const diffDays = (a: ISODate, b: ISODate) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY)
export const clampDate = (d: ISODate, lo: ISODate, hi: ISODate) => (d < lo ? lo : d > hi ? hi : d)

export function addMonths(d: ISODate, n: number): ISODate {
  const t = toDate(d)
  const y = t.getUTCFullYear(),
    m = t.getUTCMonth() + n,
    day = t.getUTCDate()
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate() // clamp Jan 31 + 1 month → Feb 28
  return fromDate(new Date(Date.UTC(y, m, Math.min(day, last))))
}

export const startOfMonth = (d: ISODate) => d.slice(0, 8) + '01'
export const endOfMonth = (d: ISODate) => addDays(addMonths(startOfMonth(d), 1), -1)
export const weekday = (d: ISODate) => (toDate(d).getUTCDay() + 6) % 7 // Monday = 0
export const startOfWeek = (d: ISODate) => addDays(d, -weekday(d))

/** Today's date in a timezone. */
export function todayIn(tz: string, now = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return fromDate(now)
  }
}

// ---- presets ----

export interface Range {
  from: ISODate
  to: ISODate
}

export interface Preset {
  id: string
  label: string
  key?: string // keyboard shortcut
  /** Kept so old links still resolve, but not offered in the menu: a wall of
   *  periods is harder to use than the six people actually pick. */
  hidden?: boolean
  range: (today: ISODate) => Range
}

/** The periods offered in the picker. */
export const VISIBLE_PRESETS = () => PRESETS.filter((p) => !p.hidden)

export const PRESETS: Preset[] = [
  // "Now" is today, by the hour, refreshing itself — the live view.
  { id: 'now', label: 'Now', key: 'n', range: (t) => ({ from: t, to: t }) },
  { id: 'today', label: 'Today', key: 't', range: (t) => ({ from: t, to: t }) },
  { id: 'yesterday', label: 'Yesterday', key: 'y', range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { id: '7d', label: 'Last 7 days', key: '7', range: (t) => ({ from: addDays(t, -6), to: t }) },
  { hidden: true, id: '14d', label: 'Last 14 days', range: (t) => ({ from: addDays(t, -13), to: t }) },
  { hidden: true, id: '28d', label: 'Last 28 days', key: '4', range: (t) => ({ from: addDays(t, -27), to: t }) },
  { id: '30d', label: 'Last 30 days', key: '3', range: (t) => ({ from: addDays(t, -29), to: t }) },
  { id: '90d', label: 'Last 90 days', key: '9', range: (t) => ({ from: addDays(t, -89), to: t }) },
  { id: '12mo', label: 'Last 12 months', key: '1', range: (t) => ({ from: addDays(addMonths(t, -12), 1), to: t }) },
  { id: 'wtd', label: 'This week', key: 'w', range: (t) => ({ from: startOfWeek(t), to: t }) },
  { hidden: true, id: 'lastweek', label: 'Last week', range: (t) => ({ from: addDays(startOfWeek(t), -7), to: addDays(startOfWeek(t), -1) }) },
  { id: 'mtd', label: 'This month', key: 'm', range: (t) => ({ from: startOfMonth(t), to: t }) },
  { id: 'lastmonth', label: 'Last month', range: (t) => ({ from: startOfMonth(addMonths(startOfMonth(t), -1)), to: addDays(startOfMonth(t), -1) }) },
  {
    hidden: true,
    id: 'qtd',
    label: 'This quarter',
    range: (t) => {
      const m = Math.floor((toDate(t).getUTCMonth()) / 3) * 3 + 1
      return { from: `${t.slice(0, 4)}-${String(m).padStart(2, '0')}-01`, to: t }
    },
  },
  { id: 'ytd', label: 'This year', range: (t) => ({ from: t.slice(0, 4) + '-01-01', to: t }) },
  {
    hidden: true,
    id: 'lastyear',
    label: 'Last year',
    range: (t) => {
      const y = String(+t.slice(0, 4) - 1)
      return { from: y + '-01-01', to: y + '-12-31' }
    },
  },
]

export const presetById = (id: string) => PRESETS.find((p) => p.id === id)

// ---- comparison ----

export type CompareMode = 'none' | 'previous' | 'year' | 'custom'

/** The comparison range the server will use (mirrors api/report.go). */
/** The period before a calendar one, the same stretch of it: This week
 *  (Mon–Thu) against last Mon–Thu, this month (1–24) against last month's
 *  1–24, this year to date against last year to date. The period of the same
 *  length just before would compare September with the April before it. */
export function calendarPrevious(period: string, r: Range): Range | null {
  switch (period) {
    case 'wtd':
      return { from: addDays(r.from, -7), to: addDays(r.to, -7) }
    case 'mtd': {
      const from = addMonths(r.from, -1)
      const to = addMonths(r.to, -1)
      return { from, to: to > endOfMonth(from) ? endOfMonth(from) : to }
    }
    case 'ytd':
      return { from: addMonths(r.from, -12), to: addMonths(r.to, -12) }
    default:
      return null
  }
}

/** What a comparison is against, in words: "last year", "last month", "the
 *  30 days before". The exact days go in a tooltip. */
export function compareLabel(period: string, mode: CompareMode, r: Range): string {
  if (mode === 'year') return 'a year before'
  if (mode === 'custom') return 'your dates'
  switch (period) {
    case 'wtd':
      return 'last week'
    case 'mtd':
      return 'last month'
    case 'ytd':
      return 'last year'
    case 'today':
      return 'yesterday'
    case 'yesterday':
      return 'the day before'
  }
  const n = diffDays(r.from, r.to) + 1
  return n === 1 ? 'the day before' : `the ${n} days before`
}

export function compareRange(r: Range, mode: CompareMode, custom?: Range, period?: string): Range | null {
  const n = diffDays(r.from, r.to) + 1
  switch (mode) {
    case 'previous':
      return (period && calendarPrevious(period, r)) || { from: addDays(r.from, -n), to: addDays(r.from, -1) }
    case 'year':
      return { from: addMonths(r.from, -12), to: addMonths(r.to, -12) }
    case 'custom':
      return custom ?? null
    default:
      return null
  }
}

/** Shift a range by its own length (the ‹ › arrows). */
export function shiftRange(r: Range, dir: -1 | 1): Range {
  // Whole months stay whole months (Mar 1–31 → Feb 1–28), like GA.
  if (r.from === startOfMonth(r.from) && r.to === endOfMonth(r.from)) {
    const from = addMonths(r.from, dir)
    return { from, to: endOfMonth(from) }
  }
  const n = diffDays(r.from, r.to) + 1
  return { from: addDays(r.from, dir * n), to: addDays(r.to, dir * n) }
}

// ---- display ----

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function fmtDay(d: ISODate, opts: { year?: boolean; weekday?: boolean } = {}) {
  const t = toDate(d)
  let s = `${monthShort[t.getUTCMonth()]} ${t.getUTCDate()}`
  if (opts.weekday) s = `${dayShort[weekday(d)]}, ${s}`
  if (opts.year) s += `, ${t.getUTCFullYear()}`
  return s
}

export function fmtRange(r: Range, today: ISODate): string {
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4)
  const showYear = !sameYear || r.from.slice(0, 4) !== today.slice(0, 4)
  if (r.from === r.to) return fmtDay(r.from, { year: showYear, weekday: true })
  if (sameYear && r.from.slice(0, 7) === r.to.slice(0, 7)) {
    return `${fmtDay(r.from)} – ${toDate(r.to).getUTCDate()}${showYear ? ', ' + r.to.slice(0, 4) : ''}`
  }
  return `${fmtDay(r.from, { year: !sameYear })} – ${fmtDay(r.to, { year: showYear })}`
}

/** Parse loose typed input: 2026-09-01, 9/1/2026, 1.9.2026, Sep 1 2026. */
export function parseLoose(s: string, today: ISODate): ISODate | null {
  s = s.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  let y: number, mo: number, d: number
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/))) [d, mo, y] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) [mo, d, y] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^([a-z]{3})[a-z]*\.? (\d{1,2}),? ?(\d{4})?$/i))) {
    mo = monthShort.findIndex((x) => x.toLowerCase() === m![1].toLowerCase()) + 1
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
  const cells: (ISODate | null)[] = Array(weekday(first)).fill(null)
  for (let i = 0; i < days; i++) cells.push(addDays(first, i))
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** The browser's own timezone, or UTC when it will not say. */
export const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
