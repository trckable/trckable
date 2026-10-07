// The days behind the Story's four tiles, from the report's own buckets.
import type { Point } from '../../lib/api'
import { carryOver } from '../../lib/carryOver'

/** Each tile's days: the charts behind the four numbers. */
export interface TileSeries {
  visitors: number[]
  bounce: number[]
  session: number[]
  revenue?: number[]
}

/** A bucket with no visit has no bounce rate or session length: those lines carry the last value over instead of falling to zero. */
export function tileSeries(points: Point[], money: boolean): TileSeries {
  const has = points.map((x) => x.visitors > 0 || x.pageviews > 0)
  return {
    visitors: points.map((x) => x.visitors),
    bounce: carryOver(points.map((x) => (x.bounce_rate ?? 0) * 100), has),
    session: carryOver(points.map((x) => x.avg_session_s ?? 0), has),
    revenue: money ? points.map((x) => x.revenue ?? 0) : undefined,
  }
}
