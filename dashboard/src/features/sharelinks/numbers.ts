// The numbers the thumbnail is drawn from: this site's last 30 days, the same
// report the dashboard asks for, so it is usually already cached.
import { useEffect, useState } from 'react'
import { cachedReport, type Report, type Site } from '../../lib/api'
import { addDays, todayIn } from '../../lib/dates'
import { fmtCompact, fmtMoney, fmtPct } from '../../lib/format'

export interface Numbers {
  visitors: string
  views: string
  bounce: string
  revenue: string | null
  /** Visitors per bucket, for the line. */
  line: number[]
  /** Revenue per bucket, for the bars. */
  bars: number[]
  /** Widths of the top rows, 0–1. */
  sources: number[]
  pages: number[]
}

/** Sums a series into at most n groups: enough to draw, few enough to see. */
export function group(values: number[], n: number): number[] {
  if (values.length <= n) return values
  const out = Array.from({ length: n }, () => 0)
  values.forEach((v, i) => (out[Math.floor((i * n) / values.length)] += v))
  return out
}

/** Row weights as bar widths, the largest one full. */
export function widths(values: number[], rows = 4): number[] {
  const top = values.slice(0, rows)
  const max = Math.max(...top, 0)
  return top.map((v) => (max ? Math.max(0.12, v / max) : 0.12))
}

export function numbersOf(r: Report): Numbers {
  const c = r.current
  return {
    visitors: fmtCompact(c.kpis.visitors),
    views: fmtCompact(c.kpis.pageviews),
    bounce: fmtPct(c.kpis.bounce_rate),
    revenue: c.money ? fmtMoney(c.money.revenue, c.money.currency, c.money.exponent, { cents: false }) : null,
    line: c.series.map((p) => p.visitors),
    bars: group(c.series.map((p) => p.revenue ?? 0), 7),
    sources: widths((c.dims.channel ?? []).map((row) => row.visitors)),
    pages: widths((c.revenue_dims?.page ?? []).map((row) => row.revenue ?? 0)),
  }
}

export function usePreviewNumbers(site: Site): Numbers | null {
  const [n, setN] = useState<Numbers | null>(null)
  useEffect(() => {
    let gone = false
    const to = todayIn(site.timezone)
    cachedReport(site.id, { from: addDays(to, -29), to, bucket: 'day' })
      .then((r) => !gone && setN(numbersOf(r)))
      .catch(() => undefined)
    return () => {
      gone = true
    }
  }, [site.id, site.timezone])
  return n
}
