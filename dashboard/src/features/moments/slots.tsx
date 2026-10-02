// Where the moments plug into the chart: its `layer`, in the chart extras'
// chunk (extras/slots).
import { extra } from '../extras/slots'
import type { LayerProps } from './MomentLayer'
import type { ChartGeo } from './marks'

/** The chart's `layer`: the moments over its plot. */
export const momentLayer = (p: Omit<LayerProps, 'g'>) => (g: ChartGeo) => extra({ part: 'moments', g, ...p })
