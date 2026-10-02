// Which pins the chart shows, and where. Each pin goes to the bucket of its
// day; the most important come first, at most MAX_MARKS of them; a pin that
// lands close to one already chosen joins it (the marker says how many) rather
// than crowd the line. Pure: marks.test.ts.
import type { Bucket } from '../../lib/api'
import { bucketOf } from '../notes/markers'
import { byScore, type Pin } from './pins'

/** More than this on one chart says nothing. */
export const MAX_MARKS = 6
/** Markers this close, in pixels, are one. */
export const MARK_GAP = 22

/** What the chart tells a layer drawn over its plot: where a bucket and a value are, in pixels. */
export interface ChartGeo {
  x: (i: number) => number
  y: (v: number) => number
  vals: number[]
  w: number
}

export interface Placed {
  i: number
  pin: Pin
}

export interface Mark {
  /** The bucket it sits on. */
  i: number
  /** The most important pin here: what the marker says and a click applies. */
  pin: Pin
  /** The others that landed beside it, most important first. */
  more: Pin[]
}

/** What the server places by the hour on an hourly chart; the rest belong to a day. */
const BY_HOUR: Pin['kind'][] = ['spike', 'sale']

/** The bucket a pin sits in: by the hour where the server said which hour, else the bucket that holds its day. -1 when the chart does not show it. */
export function bucketAt(pin: Pin, labels: string[], bucket: Bucket): number {
  if (bucket === 'hour' && pin.at && BY_HOUR.includes(pin.kind)) return labels.indexOf(pin.at.slice(0, 16))
  return pin.day ? bucketOf(pin.day, labels, bucket) : -1
}

export function placePins(pins: Pin[], labels: string[], bucket: Bucket): Placed[] {
  const out: Placed[] = []
  for (const pin of pins) {
    const i = bucketAt(pin, labels, bucket)
    if (i >= 0) out.push({ i, pin })
  }
  return out
}

/** `x` is the chart's own pixel position of a bucket. */
export function pickMarks(placed: Placed[], x: (i: number) => number, max = MAX_MARKS, gap = MARK_GAP): Mark[] {
  const marks: Mark[] = []
  for (const p of [...placed].sort((a, b) => byScore(a.pin, b.pin))) {
    const near = marks.find((m) => Math.abs(x(m.i) - x(p.i)) < gap)
    if (near) near.more.push(p.pin)
    else if (marks.length < max) marks.push({ i: p.i, pin: p.pin, more: [] })
  }
  return marks.sort((a, b) => a.i - b.i)
}
