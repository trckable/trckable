// The words over the Briefing's chart: the standing line (how the period stands against the one before, or what is wrong
// right now), the point under the pointer, and the colour the standing line is written in. Pure: chart.test.ts.
import { copy } from '../briefing/copy'
import { readOf, signed } from '../briefing/compare'
import type { ChartIn } from './DayChart'

/** The text over the chart: the standing note, or the point under the pointer. */
export function chartNote(c: ChartIn, at: number | null, down = false): string {
  if (at !== null && c.points[at]) {
    // Without a comparison the chart's own tip reads the point: the row over the chart is not there to appear and move the chart.
    if (!c.compare) return ''
    const p = c.points[at]
    return readOf(p.name, p.raw, c.compare.name, p.was, p.delta)
  }
  if (down) return copy.downRightNow
  // The usual range being built is said by the pill on the period row (UsualRange), never by a count against it.
  if (c.compare && c.compare.pct !== null) return copy.vsLine(signed(c.compare.pct), c.compare.name)
  return ''
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
