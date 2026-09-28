// Which bucket of the chart each note belongs to. A note is pinned to a day;
// the chart may be by hour, day, week or month, so a note goes to the bucket
// that holds its day, and every note in one bucket becomes one marker.
import type { Annotation, Bucket } from '../../lib/api'

export interface Marker {
  /** The bucket's index on the chart. */
  i: number
  /** The first note's day: where the list jumps to. */
  day: string
  notes: Annotation[]
}

const DAY = 86400_000
const ms = (day: string) => Date.parse(day + 'T00:00:00Z')

/** The day after the last one a bucket holds. */
function bucketEnd(start: string, bucket: Bucket): number {
  const t = ms(start)
  switch (bucket) {
    case 'hour':
    case 'day':
      return t + DAY
    case 'week':
      return t + 7 * DAY
    case 'month': {
      const d = new Date(t)
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    }
  }
}

/** The bucket holding a day, or -1 when the chart does not show that day. */
export function bucketOf(day: string, labels: string[], bucket: Bucket): number {
  const t = ms(day)
  if (Number.isNaN(t)) return -1
  // By hour, the day starts at its first hour on the chart.
  if (bucket === 'hour') return labels.findIndex((l) => l.slice(0, 10) === day)
  for (let i = labels.length - 1; i >= 0; i--) {
    const start = labels[i].slice(0, 10)
    if (ms(start) <= t) return t < bucketEnd(start, bucket) ? i : -1
  }
  return -1
}

/** One marker per bucket with notes, in the chart's order. */
export function markersFor(notes: Annotation[], labels: string[], bucket: Bucket): Marker[] {
  const byIndex = new Map<number, Marker>()
  for (const n of notes) {
    const i = bucketOf(n.day, labels, bucket)
    if (i < 0) continue
    const m = byIndex.get(i)
    if (m) m.notes.push(n)
    else byIndex.set(i, { i, day: n.day, notes: [n] })
  }
  return [...byIndex.values()].sort((a, b) => a.i - b.i)
}

/** Where a tooltip of width w goes for a marker at x, in a chart `width`
 *  wide: centred on the marker, and never past either edge. */
export function tipLeft(x: number, w: number, width: number, gap = 4): number {
  const fit = Math.min(w, width - 2 * gap)
  return Math.max(gap, Math.min(width - fit - gap, x - fit / 2))
}
