// What the main chart is given: its series, how to write them, and what hangs
// off them (notes, the live pulse, Replay).
import type { Annotation, Bucket } from '../lib/api'
import type { ChannelSeries, ChartModel } from './models/types'

export interface TimeChartProps {
  labels: string[] // local wall-clock bucket starts ("2026-09-20T09:00")
  values: number[]
  ghost?: number[] // comparison period, aligned by index
  ghostLabels?: string[]
  overlay?: { values: number[]; color: string; name: string }
  metric: string
  bucket: Bucket
  scrub?: number | null
  partialLast?: boolean // the last bucket is still in progress (today / this hour)
  /** The values are revenue: the money colour, a money axis, columns (a line once nearly every bucket sold). */
  tone?: 'money'
  /** Writes a value for the hover card, the labels and a screen reader (default: a count). */
  fmt?: (n: number) => string
  /** The values are fractions (a rate): the axis steps in thousandths, not ones. */
  fraction?: boolean
  /** Writes one label on the y-axis (default: compact). */
  axis?: (n: number) => string
  /** Revenue under the line: its own plot with its own axis (its own scale, never a second axis). */
  revenue?: { values: number[]; fmt: (n: number) => string; axis: (n: number) => string; label: string; none: string }
  /** What a bucket's sales say, under its revenue ("3 sales · $149 new"); null when there were none. */
  saleNote?: (i: number) => string | null
  onScrub?: (i: number) => void
  height?: number
  /**
   * Extra lines for the hovered bucket: split bars (new vs returning, or in
   * cookieless mode a row saying it is off) and name/value rows. The chart
   * knows how to draw them; the dashboard knows what they mean.
   */
  detail?: (i: number) => {
    /** Split bars: how the bucket divides. tone colours the filled part, fmt writes the numbers. */
    splits?: { a: number; b: number; aLabel: string; bLabel: string; tone?: string; fmt?: (v: number) => string }[]
    /** short: the label on a phone's compact card. */
    rows?: { label: string; value: string; faint?: boolean; short?: string }[]
  } | null
  /** Notes pinned to days: a launch, a post, an outage. */
  notes?: Annotation[]
  /** Adds a note to a day, from the + at the top of the crosshair. */
  onAddNote?: (day: string) => void
  /** Live pulse: things arriving right now, drawn rising from the last point. */
  pulses?: Pulse[]
  /** Replay tells a story: the line ends at the playhead, the rest unknown. */
  story?: boolean
  /** Replay is playing: no hover, touch or keys until it pauses or ends. */
  locked?: boolean
  /** The try-out's model for the line (lib/tryout); absent is the chart as it was. */
  model?: ChartModel | null
  /** With model D: the report's visitors by channel, aligned with the report's own series. */
  stack?: ChannelSeries[]
  /** Which number the chart plots (visitors, pageviews, revenue…): not every model fits every one. */
  kind?: string
}

export type Pulse = { id: string; kind: 'visit' | 'goal' | 'sale'; label?: string }
