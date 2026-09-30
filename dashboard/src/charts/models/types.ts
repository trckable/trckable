// The try-out's shared types.
export type ChartModel = 'A' | 'B' | 'C' | 'D' | 'E'

/** One layer of the stacked model: a channel (or the rest folded together), bucket by bucket. */
export interface StackLayer {
  name: string
  color: string
  values: number[]
}

/** The report's split of the visitors by channel, for the buckets the chart shows. */
export interface ChannelSeries {
  channel: string
  values: number[]
}
