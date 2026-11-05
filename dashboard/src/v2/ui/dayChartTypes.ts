// What the day chart is given: its points, the usual band, the runs outside it and the marks of the lane.
import type { Bucket } from '../../lib/api'
import type { Compare } from '../briefing/compare'
import type { Judged } from '../briefing/usual'

export interface ChartPoint {
  /** Where on the axis (in buckets from its start). */
  i: number
  /** The bucket's name for the readout: "15:00", "Fri 9 Oct". */
  name: string
  /** Its x-axis label, when it has one. */
  tick?: string
  v: number
  lo: number
  hi: number
  st: Judged
  /** What was counted so far in a bucket that is still going (`v` is the pace it is on). */
  raw: number
  /** The same bucket of the period before; none without a comparison. */
  was: number | null
  /** How far the bucket stands from it, in percent; none while the bucket is still going or nobody was there before. */
  delta: number | null
}

export interface Down {
  /** From and to, in buckets from the axis start. */
  a: number
  b: number
  min: number
  now: boolean
}

export interface ChartIn {
  points: ChartPoint[]
  /** The label of each bucket of the axis, those still to come too. */
  axis: { i: number; tick: string }[]
  /** How many buckets the axis spans (the hours still to come are shaded), and how many the whole period has (a phone draws all of them). */
  span: number
  full: number
  /** Whether the last point is "now": it pulses, and what is to its right is shaded. */
  live: boolean
  /** Hours (with the part of the last one) passed so far; 0 when the period is over. */
  elapsed: number
  /** Whether the site's own history is enough to call a bucket above or below its usual (the band, the green and red stretches, the pill where a run began). */
  band: boolean
  /** The usual range of each bucket of the period, the hours still to come too; none where the site has no usual for it yet. */
  usual: ({ lo: number; hi: number } | null)[]
  /** The period before, to say in one line and, where the site has no usual yet, to draw as a dashed line; none when it has too little before it. */
  compare: Compare | null
  /** What is said instead when a comparison was asked for and there is too little before it: when it begins. */
  noCompare: string | null
  /** The day the comparison (and with it the usual range) begins, when it has not yet: the standing line says it, never a count against a range that is not there. */
  startsOn: string | null
  /** For a chart of days: how many of the days the comparison needs there are already. */
  learn: { have: number; need: number } | null
  overall: Judged
  unit: string
  bucket: Bucket
  downs: Down[]
  notes: { i: number; text: string }[]
  /** Where the run outside the usual began (or the biggest rise, once the period is over): the bucket, when as the axis writes it, and which way. */
  started?: { i: number; when: string; dir: 'up' | 'dn'; down?: boolean }
  /** Sales on the line of the day: where on the axis (in buckets, with the part of the hour), and the amount as written. */
  sales?: { at: number; text: string; neg?: boolean }[]
}
