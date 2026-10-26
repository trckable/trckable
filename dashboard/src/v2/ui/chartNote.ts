// The words over the Briefing's chart: the standing line (how the period stands against the one before, or what is wrong
// right now), the point under the pointer, and the colour the standing line is written in. Pure: chart.test.ts.
import { copy } from '../briefing/copy'
import { readOf, signed } from '../briefing/compare'
import type { ChartIn } from './DayChart'

/** The text over the chart: the standing note, or the point under the pointer. */
export function chartNote(c: ChartIn, at: number | null, down = false, short = false): string {
  if (at !== null && c.points[at]) {
    const p = c.points[at]
    return readOf(p.name, p.raw, c.compare?.name ?? null, p.was, p.delta)
  }
  if (down) return copy.downRightNow
  if (c.compare && c.compare.pct !== null) return copy.vsLine(signed(c.compare.pct), c.compare.name)
  if (c.noCompare) return c.noCompare
  if (!c.band) return ''
  const up = c.points.filter((p) => p.st === 'up').length
  const dn = c.points.filter((p) => p.st === 'dn').length
  // The period's own verdict says it first: inside the usual band, no hour or day is called above or below it.
  if (c.overall === '') return c.bucket !== 'hour' && up + dn ? copy.normalOverall(up + dn, c.points.length) : copy.withinBand
  // A phone says it short: "Above usual · 4 of 17 h".
  if (short && c.bucket === 'hour' && (up || dn)) return `${up ? copy.aboveShort(up) : copy.belowShort(dn)}${copy.ofHours(c.points.length)}`
  if (up) return copy.aboveBand(up, c.points.length, c.unit)
  if (dn) return copy.belowBand(dn, c.unit)
  return copy.withinBand
}

/** The colour of the line over the chart when it says how the period stands against the one before: green above it, red below, none for level. */
export function chartTone(c: ChartIn, at: number | null, down = false): 'up' | 'dn' | undefined {
  const pct = c.compare?.pct
  if (at !== null || down || !pct) return undefined
  return pct > 0 ? 'up' : 'dn'
}

/** The word beside the red of the chart's down stretches: one stretch says its own minutes, several say one line for all of them, so no two labels meet. */
export function downLabel(downs: ChartIn['downs'], short: boolean): string {
  if (downs.length === 1) return short ? copy.downShort(downs[0].min, downs[0].now) : copy.downLabel(downs[0].min, downs[0].now)
  return copy.downMany(downs.length, downs.reduce((n, d) => n + d.min, 0))
}
