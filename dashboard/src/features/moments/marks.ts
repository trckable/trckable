// Which pins the chart shows, and where. Each pin goes to the bucket of its
// day; the most important come first, at most MAX_MARKS of them, never more
// than one a day: a pin that lands on the day of a marker already chosen, or
// close to it, joins it (the marker says how many) rather than crowd the lane.
// A marker is at most MARK_GAP wide, count included, so two never touch, and
// none is cut off by the chart's edge. Pure: marks.test.ts.
import type { Bucket } from '../../lib/api'
import { bucketOf } from '../notes/markers'
import { byScore, type Pin } from './pins'

/** More than this on one chart says nothing. */
export const MAX_MARKS = 6
/** Markers this close, in pixels, are one: a little more than the widest a marker is (the icon and a count up to "99+" inside its ring), so neighbours never touch. */
export const MARK_GAP = 52
/** The least between a marker's middle and the chart's edge: half of MARK_GAP, so none is cut off. */
export const MARK_EDGE = MARK_GAP / 2

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
  /** Where its middle is, in pixels: the bucket's, kept off the chart's edges. */
  at: number
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

const sameDay = (m: Mark, pin: Pin) => !!pin.day && [m.pin, ...m.more].some((q) => q.day === pin.day)

/** `x` is the chart's own pixel position of a bucket; `edge` the pixels the markers may use ([from, to]). */
export function pickMarks(placed: Placed[], x: (i: number) => number, edge: [number, number] = [-Infinity, Infinity], max = MAX_MARKS, gap = MARK_GAP): Mark[] {
  const marks: Mark[] = []
  for (const p of [...placed].sort((a, b) => byScore(a.pin, b.pin))) {
    const at = Math.min(Math.max(x(p.i), edge[0]), edge[1])
    const near = marks.find((m) => sameDay(m, p.pin) || Math.abs(m.at - at) < gap)
    if (near) near.more.push(p.pin)
    else if (marks.length < max) marks.push({ i: p.i, at, pin: p.pin, more: [] })
  }
  return marks.sort((a, b) => a.i - b.i)
}

/** The marker whose line is on show: the one pointed at or focused, and none while a card is open (one thing at a time: the marker is only lit then). */
export const tipOf = (marks: Mark[], shown: number | null, cardOpen: boolean): Mark | undefined => (cardOpen ? undefined : marks.find((m) => m.i === shown))
