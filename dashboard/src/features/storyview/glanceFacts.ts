// What the hero's "at a glance" panel draws, from the report the Story already has.
import type { Result, Row } from '../../lib/api'

export interface Glance {
  values: number[]
  /** The period before, only when it has days to draw. */
  was?: number[]
  first: string
  last: string
  /** The busiest bucket, as its local timestamp, and its visitors. */
  peak: { t: string; visitors: number }
  source?: { value: string; share: number }
  country?: { value: string; share: number }
}

const top = (rows: Row[] | null | undefined, whole: number) => {
  const r = rows?.[0]
  return r && whole > 0 ? { value: r.value, share: Math.min(1, r.visitors / whole) } : undefined
}

/** The panel's facts, or none when there is nothing to draw (fewer than two buckets, or no visitors). */
export function glanceOf(cur: Result, prev?: Result): Glance | undefined {
  const s = cur.series
  const whole = cur.kpis.visitors
  if (s.length < 2 || whole <= 0) return undefined
  let at = 0
  s.forEach((x, i) => {
    if (x.visitors > s[at].visitors) at = i
  })
  const was = prev && prev.series.length > 1 && prev.kpis.visitors > 0 ? prev.series.map((x) => x.visitors) : undefined
  return {
    values: s.map((x) => x.visitors),
    was,
    first: s[0].t,
    last: s[s.length - 1].t,
    peak: { t: s[at].t, visitors: s[at].visitors },
    source: top(cur.dims.channel, whole),
    country: top(cur.dims.country, whole),
  }
}
