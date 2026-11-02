// Why a number moved between two periods: the one breakdown that explains most of the gap, split into its movers.
// Only the report's own figures: a breakdown's rows add up, so the causes and "everything else" sum to the gap.
import type { Result, Row } from '../../lib/api'

export type Metric = 'visitors' | 'pageviews' | 'signups' | 'revenue'
export type Dim = 'referrer' | 'entry_page' | 'country' | 'device'

export interface Cause {
  dim: Dim
  value: string
  was: number
  now: number
  diff: number
}

export interface Why {
  metric: Metric
  now: number
  was: number
  diff: number
  pct: number | null
  /** few: too little to compare. flat: nothing moved. mix: the total held but what is inside it moved. moved: the total moved. */
  kind: 'few' | 'flat' | 'mix' | 'moved'
  dim: Dim | null
  causes: Cause[]
  rest: number
  /** The share of the period's buckets gone when half of the gap had opened (0 to 1); null when it cannot be said. */
  opened: number | null
  openedAt: string | null
}

const DIMS: Dim[] = ['referrer', 'entry_page', 'country', 'device']
const MAX_CAUSES = 5
const TRUNCATED = 10 // a list this long may have been cut: a value missing from it is not proven to be zero
const MIN_BASE: Record<Metric, number> = { visitors: 20, pageviews: 20, signups: 5, revenue: 1 }
const FLAT_PCT = 5

export function totalOf(r: Result, m: Metric): number {
  if (m === 'signups') return r.signup?.visitors ?? 0
  if (m === 'revenue') return r.money?.revenue ?? 0
  return r.kpis[m]
}

const valueOf = (x: Row, m: Metric): number => (m === 'signups' ? x.signups : m === 'revenue' ? x.revenue : x[m]) ?? 0

const rowsOf = (r: Result, d: Dim, m: Metric): Row[] => (m === 'revenue' ? r.revenue_dims?.[d] : r.dims[d]) ?? []

function moversIn(cur: Result, prev: Result, d: Dim, m: Metric): Cause[] {
  const now = rowsOf(cur, d, m)
  const was = rowsOf(prev, d, m)
  const smallest = (rows: Row[]) => (rows.length >= TRUNCATED ? Math.min(...rows.map((x) => valueOf(x, m))) : 0)
  const out = new Map<string, Cause>()
  for (const x of now) {
    const before = was.find((y) => y.value === x.value)
    const w = before ? valueOf(before, m) : smallest(was)
    out.set(x.value, { dim: d, value: x.value, now: valueOf(x, m), was: w, diff: valueOf(x, m) - w })
  }
  for (const y of was) {
    if (out.has(y.value)) continue
    const n = smallest(now)
    out.set(y.value, { dim: d, value: y.value, now: n, was: valueOf(y, m), diff: n - valueOf(y, m) })
  }
  return [...out.values()].filter((c) => c.diff !== 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}

/** When half of the gap had opened, along the two periods' series. */
function whenOpened(cur: Result, prev: Result, m: Metric): { at: string; share: number } | null {
  if (m !== 'visitors' && m !== 'pageviews') return null
  const n = Math.min(cur.series.length, prev.series.length)
  if (n < 3) return null
  const gap = (i: number) => cur.series[i][m] - prev.series[i][m]
  let all = 0
  for (let i = 0; i < n; i++) all += gap(i)
  if (all === 0) return null
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += gap(i)
    if (sum / all >= 0.5) return { at: cur.series[i].t, share: i / (n - 1) }
  }
  return null
}

export function explain(cur: Result, prev: Result, metric: Metric): Why {
  const now = totalOf(cur, metric)
  const was = totalOf(prev, metric)
  const diff = now - was
  const pct = was > 0 ? (diff / was) * 100 : null
  const base = { metric, now, was, diff, pct, dim: null, causes: [], rest: diff, opened: null, openedAt: null }
  if (Math.max(now, was) < MIN_BASE[metric]) return { ...base, kind: 'few' }

  const big = Math.abs(pct ?? 100) >= FLAT_PCT
  // The breakdown whose top movers account for the most: the one that tells the story in the fewest rows.
  const best = DIMS.map((d) => ({ d, list: moversIn(cur, prev, d, metric) }))
    .map((x) => ({ ...x, reach: x.list.slice(0, MAX_CAUSES).reduce((a, c) => a + Math.abs(c.diff), 0) * (x.d === 'device' ? 0.5 : 1) })) // almost every drop shows on phones and desktops alike: it says little
    .sort((a, b) => b.reach - a.reach)[0]
  const floor = Math.max(Math.abs(diff) * 0.1, Math.max(now, was) * 0.03)
  const causes = best.list.filter((c) => Math.abs(c.diff) >= floor).slice(0, MAX_CAUSES)
  if (!causes.length) return { ...base, kind: big ? 'moved' : 'flat' }
  const mixed = !big && Math.abs(causes[0].diff) >= Math.max(now, was) * 0.1
  if (!big && !mixed) return { ...base, kind: 'flat' }
  const opened = big ? whenOpened(cur, prev, metric) : null
  return {
    ...base,
    kind: big ? 'moved' : 'mix',
    dim: best.d,
    causes,
    rest: diff - causes.reduce((a, c) => a + c.diff, 0),
    opened: opened?.share ?? null,
    openedAt: opened?.at ?? null,
  }
}
