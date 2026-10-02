// The small chart of a pin's moment, from what the page already has: the days
// of the chart on screen (visitors, revenue) and, for a source, its own last
// days. A spike against its usual level, a sale as the week's bars, a drop as the
// rate before and after, a milestone as a climb. Pure: pinChart.test.ts.
import type { ChartSpec } from '../../components/SideCard/chartGeometry'
import type { Point } from '../../lib/api'
import type { Pin } from './pins'

/** Days the chart shows around a moment. */
const DAYS = 7

interface Day {
  day: string
  visitors: number
  revenue: number
}

/** The chart's buckets as whole days (an hourly chart is added up). */
export function byDay(series: readonly Point[]): Day[] {
  const days = new Map<string, Day>()
  for (const p of series) {
    const day = p.t.slice(0, 10)
    const d = days.get(day) ?? { day, visitors: 0, revenue: 0 }
    d.visitors += p.visitors
    d.revenue += p.revenue ?? 0
    days.set(day, d)
  }
  return [...days.values()]
}

/** Up to DAYS days with the moment's in them, near the end when the moment is recent. */
function around(days: Day[], day: string | undefined): { window: Day[]; at: number } | null {
  if (days.length < 2) return null
  const i = day ? days.findIndex((d) => d.day === day) : days.length - 1
  if (i < 0) return null
  const end = Math.min(days.length, Math.max(i + 3, DAYS))
  const window = days.slice(Math.max(0, end - DAYS), end)
  return { window, at: window.findIndex((d) => d.day === days[i].day) }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  if (s.length === 0) return 0
  const mid = s.length / 2
  return s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2
}

/** A source's own last days, from its sparkline: the last DAYS of them, the moment (if it has a day among them) marked. */
function ownDays(values: readonly number[] | undefined, days: readonly string[] | undefined, day: string | undefined): ChartSpec | null {
  if (!values || values.length < 2) return null
  const v = values.slice(-DAYS)
  const hl = day && days ? days.slice(-DAYS).indexOf(day) : -1
  return { values: v, hl: hl >= 0 ? hl : v.length - 1 }
}

export interface Own {
  values?: readonly number[]
  days?: readonly string[]
}

export function pinChart(pin: Pin, series: readonly Point[], own?: Own): ChartSpec | null {
  const { n } = pin
  switch (pin.kind) {
    case 'spike': {
      const w = around(byDay(series), pin.day)
      if (!w) return null
      const values = w.window.map((d) => d.visitors)
      const others = values.filter((_, i) => i !== w.at)
      // The server's own "times the usual" gives the usual; without it, the other days' median.
      const base = n.visitors && n.factor ? n.visitors / n.factor : median(others)
      return { values, base, hl: w.at, soft: true }
    }
    case 'sale': {
      const w = around(byDay(series), pin.day)
      if (!w) return null
      const values = w.window.map((d) => d.revenue)
      return values.some((v) => v > 0) ? { values, hl: w.at, bars: true } : null
    }
    case 'drop': {
      if (n.wasRate === undefined || n.rate === undefined) return null
      // The rate before and after, as the server found them: a level, then a step down.
      return { values: [n.wasRate, n.wasRate, n.wasRate, n.wasRate, n.rate, n.rate, n.rate], base: n.wasRate, hl: 4 }
    }
    case 'milestone': {
      const family = n.family
      if (family !== 'visitors' && family !== 'pageviews' && family !== 'revenue') return null
      const days = byDay(series)
      const value = n.value
      if (days.length < 2 || !value) return null
      const raw = days.map((d) => (family === 'revenue' ? d.revenue : d.visitors))
      let sum = 0
      const cum = raw.map((v) => (sum += v))
      const last = cum[cum.length - 1]
      // The climb is the chart's own shape, scaled to end at the number reached.
      return last > 0 ? { values: cum.slice(-14).map((v) => (v / last) * value), goal: value, hl: Math.min(13, cum.length - 1) } : null
    }
    case 'referrer':
    case 'move':
      return ownDays(own?.values, own?.days, pin.day)
    default:
      return null
  }
}
