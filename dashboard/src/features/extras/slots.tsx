// Where the chart's extras plug into the dashboard: the pace line and the
// rings, one chunk between them, fetched when they are first drawn.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import type { ChartGeo } from './ChartRings'
import type { ExtraProps } from './ChartExtras'

const Extras = lazyLoad(() => import('./ChartExtras'))

export const extra = (p: ExtraProps) => (
  <Suspense fallback={null}>
    <Extras {...p} />
  </Suspense>
)

/** The chart's `layer`: rings over the plot. */
export const ringLayer = (p: Omit<Extract<ExtraProps, { part: 'rings' }>, 'part' | 'g'>) => (g: ChartGeo) => extra({ part: 'rings', g, ...p })
