// The rings on the main chart: which bucket each marker belongs to, and its
// one line of why. Pure: rings.test.ts.
import type { Bucket } from '../../lib/api'
import type { ChartMarker } from './extrasApi'
import { channelLabel } from '../../lib/palette'
import { extrasCopy } from './copy'

export interface Ring {
  i: number
  m: ChartMarker
}

/** Markers come by the day, or by the hour for an hourly chart; a week or a month holds the days it is made of. */
export const markerBucket = (chart: Bucket): 'day' | 'hour' => (chart === 'hour' ? 'hour' : 'day')

/** The chart bucket each marker sits in: the one that starts at it, or for a week or month the last one that started before it. Before the chart starts: none. */
export function ringsAt(markers: ChartMarker[], labels: string[]): Ring[] {
  const out: Ring[] = []
  for (const m of markers) {
    let at = -1
    for (let i = 0; i < labels.length && labels[i] <= m.t; i++) at = i
    if (at >= 0) out.push({ i: at, m })
  }
  return out
}

/** The one line a ring says: what it was, and who was behind it. */
export function ringWhy(m: ChartMarker, money: (minor: number) => string): string {
  const c = extrasCopy.ring
  const parts: string[] = []
  if (m.kind === 'spike') {
    parts.push(c.spike(m.factor))
    if (m.referrer) parts.push(c.from(m.referrer))
  } else {
    parts.push(c.burst(m.factor))
  }
  if (m.count) parts.push(c.sales(m.count, money(m.amount ?? 0)))
  if (m.kind === 'sale' && m.channel) parts.push(c.mostly(channelLabel(m.channel)))
  return parts.join(' · ')
}

/** What a screen reader hears for the ring at bucket i: the day, then the why. */
export const ringLabel = (when: string, why: string) => `${when}: ${why}`

