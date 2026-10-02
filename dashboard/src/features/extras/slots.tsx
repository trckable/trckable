// Where the chart's extras plug into the dashboard: one chunk, fetched when
// the first is drawn.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import type { ExtraProps } from './ChartExtras'

const Extras = lazyLoad(() => import('./ChartExtras'))

export const extra = (p: ExtraProps) => (
  <Suspense fallback={null}>
    <Extras {...p} />
  </Suspense>
)
