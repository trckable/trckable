// The period before, drawn as a thin dashed line under the chart and told in one line over it. It is the `previous`
// of the same report the main line comes from, bucket against bucket, so the hover, the line and the sentence cannot
// disagree. Pure: compare.test.ts.
import type { Point } from '../../lib/api'
import { addDays, compareLabel, diffDays, fmtDay, type CompareMode, type Range } from '../../lib/dates'
import { fmtInt } from '../../lib/format'
import { tag } from '../../i18n'

export interface Compare {
  /** What it is against, as the line over the chart says it: "last month". */
  name: string
  /** The previous period's people, bucket by bucket from the start of the chart. */
  vals: number[]
  /** How far the buckets that are over stand from the same buckets before, in percent; none when there was nobody before. */
  pct: number | null
}

const SAYS_AS: Record<string, string> = { '7d': 'wtd', '28d': 'mtd', '30d': 'mtd' }

/** What the comparison is against, in words: a week is "last week" and a month "last month", whatever days it counts. */
export function againstName(period: string, mode: CompareMode, range: Range): string {
  return compareLabel(SAYS_AS[period] ?? period, mode, range)
}

/** The name at the end of the dashed line. */
export const capital = (s: string): string => s.charAt(0).toLocaleUpperCase(tag) + s.slice(1)

/** A change as it is written: "+18%", "-7%". */
export const signed = (pct: number): string => `${pct > 0 ? '+' : ''}${pct < 0 ? '-' : ''}${fmtInt(Math.abs(pct))}%`

/** How far a figure stands from the one before it, in whole percent; none when there was nothing before. */
export const changeOf = (now: number, was: number): number | null => (was > 0 ? Math.round(((now - was) / was) * 100) : null)

/** The period before has a line to draw when the site was already seen in the first half of it. */
export const hasBefore = (prev: readonly Point[] | undefined): boolean => {
  const first = (prev ?? []).findIndex((p) => p.visitors > 0)
  return first >= 0 && first < (prev ?? []).length / 2
}

const minutes = (t: string) => Date.parse(t.length > 10 ? `${t.slice(0, 16)}:00Z` : `${t}T00:00:00Z`)

/** The size of one bucket, in minutes: the gap between the first two points (none for a single point). */
export const grainOf = (xs: readonly Point[]): number | null => (xs.length > 1 ? (minutes(xs[1].t) - minutes(xs[0].t)) / 60000 : null)

/** Two series can stand side by side only when they have no more buckets (a period still running is told against the start of the one before) and buckets of the same size (a day's total is never set against an hour's). */
export const sameGrain = (cur: readonly Point[], prev: readonly Point[] | undefined): boolean => !!prev && prev.length <= cur.length && grainOf(cur) === grainOf(prev)

/** The comparison of a chart: the period before's line and how the buckets that are over stand against it (`done` of them). None without enough before. */
export function compareOf(cur: readonly Point[], prev: readonly Point[] | undefined, done: number, name: string): Compare | null {
  if (!prev || !sameGrain(cur, prev) || !hasBefore(prev)) return null
  const vals = prev.map((p) => p.visitors)
  const n = Math.min(done, cur.length, vals.length)
  const sum = (xs: number[]) => xs.slice(0, n).reduce((a, b) => a + b, 0)
  return { name, vals, pct: changeOf(sum(cur.map((p) => p.visitors)), sum(vals)) }
}

/** The day the comparison begins to say something: a whole period after the site's first visit. None while nobody has visited. */
export function startsOn(cur: readonly Point[], prev: readonly Point[] | undefined): string | null {
  const all = [...(prev ?? []), ...cur]
  const first = all.find((p) => p.visitors > 0)
  if (!first || cur.length === 0) return null
  const days = diffDays(cur[0].t.slice(0, 10), cur[cur.length - 1].t.slice(0, 10)) + 1
  return fmtDay(addDays(first.t.slice(0, 10), days))
}
