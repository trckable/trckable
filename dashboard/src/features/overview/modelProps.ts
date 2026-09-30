// The try-out's model for the main chart, and what it needs from the report.
// Money keeps its own drawing (columns, a line once nearly every day sells);
// D is visitors by channel, E a running total, so neither is drawn for a
// number that is not a count added up: they fall back to A.
import { otherLabel } from '../../charts/models/modelCopy'
import { foldLayers } from '../../charts/models/modelMath'
import type { ChartModel, StackLayer } from '../../charts/models/types'
import type { Result } from '../../lib/api'
import { channelColor, channelLabel } from '../../lib/palette'
import { chartModel } from '../../lib/tryout'
import type { ChartMetric } from './chartMetric'

const STACKED = 4

function modelFor(asked: ChartModel | null, metric: ChartMetric): ChartModel | null {
  if (!asked || metric === 'revenue' || metric === 'per-visitor') return null
  const counts = metric === 'visitors' || metric === 'pageviews'
  if (asked === 'E' && !counts) return 'A'
  if (asked === 'D' && metric !== 'visitors') return 'A'
  return asked
}

/** The top channels as layers (the rest folded into one), for the buckets the chart shows. */
function layersOf(res: Result | undefined, from: number, len: number): StackLayer[] | undefined {
  const all = res?.series_by_channel
  if (!all?.length) return undefined
  return foldLayers(
    all.map((s) => ({ name: channelLabel(s.channel), color: channelColor(s.channel), values: s.values.slice(from, from + len) })),
    STACKED,
    { name: otherLabel, color: 'var(--text-3)' },
  )
}

export function modelProps(metric: ChartMetric, res: Result | undefined, from: number, len: number) {
  const model = modelFor(chartModel(), metric)
  return {
    model,
    /** The models that are about the period before draw it whether or not Compare is on. */
    prev: model === 'C' || model === 'E',
    stack: model === 'D' ? layersOf(res, from, len) : undefined,
  }
}
