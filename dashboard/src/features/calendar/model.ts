// The month grid as numbers: what a day is set against, how hot its cell is,
// where the arrow keys go, and what the day tells. Pure, so it can be tested.
import type { Annotation } from '../../lib/api'
import { addDays, dayShort, startOfMonth, weekStartsOn } from '../../lib/dates'

export interface CalDay {
  day: string
  visitors: number
  /** The same weekday's mean over the last four weeks; 0 when the site has none yet. */
  usual: number
  revenue?: number
  sales?: number
  /** Visitors per hour (24), for days that have begun. */
  hours?: number[]
  source?: string
  page?: string
}

export type MomentKind = 'spike' | 'surge' | 'sale' | 'milestone' | 'new_referrer' | 'ai'

export interface CalMoment {
  /** "2026-09-07T14:00": the hour where it has one, else the day at 00:00. */
  t: string
  kind: MomentKind
  factor?: number
  visitors?: number
  count?: number
  amount?: number
  referrer?: string
  channel?: string
  bot?: string
  family?: string
  step?: string
  value?: number
  currency?: string
}

export interface CalMonth {
  month: string
  today: string
  days: CalDay[]
  moments: CalMoment[]
  notes: Annotation[]
  /** A filter is on: the numbers follow it, the moments, notes and plans are the whole site's. */
  filtered: boolean
  /** The mean visitors of each weekday (Sunday first) over the month's finished days. */
  weekday_avg: number[]
  currency?: string
  exponent?: number
}

/** What a day did against its usual, in whole percent; null when there is nothing to set it against (no usual, a day not over, a day to come). */
export function changeVs(d: CalDay, today: string): number | null {
  if (d.day >= today || d.usual <= 0) return null
  return Math.round((d.visitors / d.usual - 1) * 100)
}

/** A day's heat, 0 to 1, against the month's cap. */
export const heatOf = (visitors: number, cap: number): number => (cap > 0 ? Math.min(1, visitors / cap) : 0)

/** The most a day counts for in the tint: a little over the month's 90th percentile of finished days, so one spike does not flatten the rest. */
export function heatCap(days: CalDay[], today: string): number {
  const v = days.filter((d) => d.day < today && d.visitors > 0).map((d) => d.visitors).sort((a, b) => a - b)
  if (!v.length) return 0
  return Math.max(1, v[Math.floor((v.length - 1) * 0.9)] * 1.15)
}

/** The weekday names of the header and each one's average, from the site's first weekday. */
export function weekdayHeader(avg: number[]): { name: string; avg: number }[] {
  const first = weekStartsOn()
  return Array.from({ length: 7 }, (_, i) => {
    const js = (first + i) % 7 // Sunday is 0, as the server sends it
    return { name: dayShort[(js + 6) % 7], avg: avg[js] ?? 0 }
  })
}

const ORDER: MomentKind[] = ['spike', 'surge', 'sale', 'milestone', 'new_referrer', 'ai']

/** The moments of each day, in the order their icons are drawn. */
export function momentsByDay(moments: CalMoment[]): Map<string, CalMoment[]> {
  const by = new Map<string, CalMoment[]>()
  for (const m of moments) by.set(m.t.slice(0, 10), [...(by.get(m.t.slice(0, 10)) ?? []), m])
  for (const [k, list] of by) by.set(k, list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.t.localeCompare(b.t)))
  return by
}

/** The notes and plans of each day. */
export function notesByDay(notes: Annotation[]): Map<string, Annotation[]> {
  const by = new Map<string, Annotation[]>()
  for (const n of notes) by.set(n.day, [...(by.get(n.day) ?? []), n])
  return by
}

/** How a finished planned day went: its visitors against the weekday's usual, in whole percent; null when nothing was planned, the day is not over, or there is no usual. */
export function planScore(d: CalDay, plans: Annotation[], today: string): number | null {
  return plans.some((n) => n.planned) ? changeVs(d, today) : null
}

/** The day an arrow key goes to, kept inside the month; the same day when it would leave. */
export function stepDay(day: string, key: string, month: string): string {
  const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[key]
  if (by === undefined) return day
  const next = addDays(day, by)
  return next.slice(0, 7) === month ? next : day
}

/** The month a calendar address names: its own, or the month the period ends in. */
export function monthOf(cal: string | undefined, periodEnd: string): string {
  return cal && cal !== '1' ? cal.slice(0, 7) : periodEnd.slice(0, 7)
}

export const monthStep = (month: string, by: -1 | 1): string => {
  const first = startOfMonth(month + '-01')
  const d = new Date(first + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + by)
  return d.toISOString().slice(0, 7)
}
