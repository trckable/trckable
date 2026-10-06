// Glance's rules, in one place so the thresholds can be tuned: the verdict
// word under the hero number and the single alert. Starting proposals, not
// validated benchmarks. Pure: rules.test.ts.
import { fmtInt } from '../../lib/format'
import { fmtDay } from '../../lib/dates'
import { copy } from './copy'

export const T = {
  /** Verdict: a change beyond this either way is growing or slowing down. */
  verdict: 0.05,
  /** Alert 1: this share leaving after one page. */
  bounce: 0.75,
  /** Alert 2: visitors down by more than this against the period before. */
  down: 0.25,
  /** Alert 3: one source down by more than this. */
  sourceDown: 0.4,
  /** Alert 3 ignores sources smaller than this many visitors before. */
  sourceMin: 20,
  /** Alert 4: hours without data. */
  quietHours: 24,
  /** A best day this many times the usual one is worth naming. */
  bestNotable: 1.5,
} as const

export interface DayPoint {
  /** ISO date, or a timestamp label for finer buckets. */
  date: string
  visitors: number
  partial?: boolean
}

export type TileKey = 'source' | 'carrying' | 'staying' | 'reading' | 'device' | 'country' | 'goals' | 'revenue'

/** The days that count: not today's partial one, and not the empty run before tracking began. */
export function countedDays(days: DayPoint[]): DayPoint[] {
  const first = days.findIndex((d) => d.visitors > 0)
  return first < 0 ? [] : days.slice(first).filter((d) => !d.partial)
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Two significant digits: "~1,100", never "~1,087". */
export function roughly(n: number): number {
  if (n < 100) return Math.round(n)
  const f = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / f) * f
}

/** The best of the counted days, if there is one. */
export function bestDay(days: DayPoint[]): DayPoint | null {
  const c = countedDays(days)
  if (!c.length) return null
  return c.reduce((a, b) => (b.visitors > a.visitors ? b : a))
}

export interface VerdictIn {
  days: DayPoint[]
  visitors: number
  /** Visitors the period before; absent when there is no earlier period yet. */
  prevVisitors?: number
}

export interface Verdict {
  word: string
  explain: string
  tone: 'good' | 'flat' | 'bad'
}

export function verdictOf(i: VerdictIn): Verdict {
  const days = countedDays(i.days)
  const typical = roughly(median(days.map((d) => d.visitors)))
  const best = bestDay(i.days)
  const notable = best && days.length >= 7 && best.visitors >= T.bestNotable * Math.max(1, median(days.map((d) => d.visitors)))
  const bestNote = notable && best ? `, ${copy.bestDay(fmtDay(best.date.slice(0, 10)))}` : ''
  if (i.prevVisitors === undefined || i.prevVisitors <= 0) {
    const h = days.length >> 1
    const sum = (xs: DayPoint[]) => xs.reduce((a, d) => a + d.visitors, 0)
    const up = days.length >= 4 && sum(days.slice(days.length - h)) > sum(days.slice(0, h))
    return { word: up ? copy.growing : copy.starting, tone: up ? 'good' : 'flat', explain: `${copy.firstMonth}, ${copy.levelFirst(fmtInt(typical))}${bestNote}` }
  }
  const change = (i.visitors - i.prevVisitors) / i.prevVisitors
  const tail = `${copy.level(fmtInt(typical))}${bestNote}`
  if (change > T.verdict) return { word: copy.growing, tone: 'good', explain: tail }
  if (change < -T.verdict) return { word: copy.slowing, tone: 'bad', explain: tail }
  return { word: copy.steady, tone: 'flat', explain: tail }
}

export interface SourceCount {
  key: string
  label: string
  visitors: number
}

export interface AlertIn {
  bounce: number
  visitors: number
  prevVisitors?: number
  sources: SourceCount[]
  prevSources?: SourceCount[]
  /** Milliseconds of the last visit seen, when the site has had one. */
  lastEventAt?: number
  now: number
  /** The period reaches today: only then can the tracking have gone quiet. */
  includesToday: boolean
}

export interface Alert {
  kind: 'bounce' | 'down' | 'source' | 'quiet'
  headline: string
  sub: string
  /** The tile whose panel it opens; 'help' is the not-receiving-data panel. */
  tile: TileKey | 'help'
}

/** The one alert that matters most, or none. */
export function alertOf(i: AlertIn): Alert | null {
  if (i.visitors > 0 && i.bounce >= T.bounce) {
    return { kind: 'bounce', headline: copy.alertBounce(Math.round(i.bounce * 10)), sub: copy.alertBounceSub, tile: 'staying' }
  }
  const prev = i.prevVisitors
  if (prev !== undefined && prev > 0 && (i.visitors - prev) / prev < -T.down) {
    return { kind: 'down', headline: copy.alertDown(copy.periodWord), sub: copy.alertDownSub, tile: 'source' }
  }
  const was = new Map((i.prevSources ?? []).map((s) => [s.key, s]))
  let worst: { label: string; drop: number } | null = null
  for (const [key, p] of was) {
    if (p.visitors < T.sourceMin) continue
    const now = i.sources.find((s) => s.key === key)?.visitors ?? 0
    const drop = (p.visitors - now) / p.visitors
    if (drop > T.sourceDown && (!worst || drop > worst.drop)) worst = { label: p.label, drop }
  }
  if (worst) return { kind: 'source', headline: copy.alertSource(worst.label), sub: copy.alertSourceSub, tile: 'source' }
  if (i.includesToday && i.lastEventAt && i.now - i.lastEventAt > T.quietHours * 3_600_000) {
    const when = fmtDay(new Date(i.lastEventAt).toISOString().slice(0, 10))
    return { kind: 'quiet', headline: copy.alertQuiet(when), sub: copy.alertQuietSub, tile: 'help' }
  }
  return null
}
