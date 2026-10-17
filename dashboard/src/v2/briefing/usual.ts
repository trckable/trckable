// "Usual": what the same weekday brought at the same hour over the last eight weeks (the middle value, and how far
// the weeks spread), so a number can be told high, low or as usual. The walkthrough's own rule, on the site's own
// history. Pure: usual.test.ts.
import type { Point } from '../../lib/api'

export interface Band {
  /** The usual (the middle of the weeks). */
  c: number
  lo: number
  hi: number
}

export type Judged = '' | 'up' | 'dn'

/** The weeks behind a figure: eight for a short look, everything we have for a long one. */
export type Mode = 'short' | 'long'
const WINDOW = 56

const weekdayOf = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay()
const addDays = (day: string, n: number) => new Date(new Date(day + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
const quantile = (xs: number[], t: number) => xs[Math.round(t * (xs.length - 1))]
const spread = (xs: number[]) => (quantile(xs, 0.8) - quantile(xs, 0.2)) / 2

/** An hour of the week's usual: the middle value and half the spread of the middle 60% of the weeks. */
export interface Table {
  c: number[]
  hw: number[]
}

/** The 168 hours of a week from hourly history (oldest first, the site's own clock), the eight weeks before `today`. */
export function hourTable(hist: Point[], today: string, mode: Mode = 'short', of: (p: Point) => number = (p) => p.visitors, mean = false): Table | null {
  const from = mode === 'long' ? '0000-00-00' : addDays(today, -WINDOW)
  const slots: number[][] = Array.from({ length: 168 }, () => [])
  for (const p of hist) {
    const day = p.t.slice(0, 10)
    if (day >= today || day < from) continue
    slots[weekdayOf(day) * 24 + Number(p.t.slice(11, 13))].push(of(p))
  }
  if (slots.every((s) => s.length < 2)) return null
  const c = new Array<number>(168).fill(0)
  const hw = new Array<number>(168).fill(0)
  slots.forEach((xs, i) => {
    if (!xs.length) return
    if (mean) {
      // Sales are sparse: their usual is the average, and how far the weeks spread is their deviation.
      const m = xs.reduce((a, b) => a + b, 0) / xs.length
      c[i] = m
      hw[i] = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
      return
    }
    xs.sort((a, b) => a - b)
    c[i] = quantile(xs, 0.5)
    hw[i] = spread(xs)
  })
  return { c, hw }
}

const width = (spreadSq: number, c: number, mode: Mode) => 1.3 * Math.sqrt(spreadSq) + (mode === 'long' ? 0.1 : 0.06) * Math.abs(c)

/** The band over a stretch of hours: each counted by the share of it that has happened (fr, 0 to 1). */
export function stretchBand(t: Table, hours: { day: string; hour: number; fr: number }[], mode: Mode = 'short', signed = false): Band {
  let c = 0
  let q = 0
  for (const h of hours) {
    const i = weekdayOf(h.day) * 24 + h.hour
    c += t.c[i] * h.fr
    q += (t.hw[i] * h.fr) ** 2
  }
  const m = width(q, c, mode)
  return { c, lo: signed ? c - m : Math.max(0, c - m), hi: c + m }
}

/** One day's band from the daily totals (oldest first, the last being today and left out): the same weekday, the days of the window except itself. */
export function dayBandOf(totals: number[], days: string[], i: number, mode: Mode = 'short'): Band | null {
  const end = totals.length - 1
  const wd = weekdayOf(days[i])
  const from = mode === 'long' ? 0 : Math.max(0, end - WINDOW)
  const xs: number[] = []
  for (let k = from; k < end; k++) if (k !== i && weekdayOf(days[k]) === wd) xs.push(totals[k])
  if (!xs.length) return null
  xs.sort((a, b) => a - b)
  const c = quantile(xs, 0.5)
  const m = 1.3 * spread(xs) + (mode === 'long' ? 0.1 : 0.06) * c
  return { c, lo: Math.max(0, c - m), hi: c + m }
}

/** Above its band, below it, or inside; a hair of tolerance (half a person) so a flat zero is never "up". */
export function judge(v: number, b: Band, thr = 0.5): Judged {
  if (v > b.hi + thr) return 'up'
  return v < b.lo - thr ? 'dn' : ''
}

/** The share who usually leave after one page: the days of the window (the same weekday, when one is asked), each counted by its people. */
export function usualBounce(daily: Point[], today: string, weekday: number | null): number | null {
  const from = addDays(today, -WINDOW)
  let people = 0
  let left = 0
  for (const p of daily) {
    const day = p.t.slice(0, 10)
    if (day >= today || day < from || p.bounce_rate === undefined) continue
    if (weekday !== null && weekdayOf(day) !== weekday) continue
    people += p.visitors
    left += p.visitors * p.bounce_rate
  }
  return people >= 30 ? left / people : null
}

/** A slice's band from the same figure on the weekdays before it (what the server calls its weeks): the middle, and the spread. */
export function bandFromWeeks(weeks: number[]): Band | null {
  if (weeks.length < 2) return null
  const xs = [...weeks].sort((a, b) => a - b)
  const c = quantile(xs, 0.5)
  const m = 1.3 * spread(xs) + 0.06 * c
  return { c, lo: Math.max(0, c - m), hi: c + m }
}

/** A slice's band from the period before it, a quarter either way; none when that had too few to say. */
export function bandFromBefore(was: number | undefined): Band | null {
  return was === undefined || was < 3 ? null : { c: was, lo: Math.max(0, Math.floor(was * 0.75)), hi: Math.ceil(was * 1.25) + 1 }
}
