// The line about the biggest jump, under the main chart's headline: its code is
// fetched when the page asks, and nothing is drawn where the chart is shared,
// told by the replay or drawn by the hour.
import { lazy, Suspense } from 'react'
import type { Point } from '../../lib/api'

const BiggestLine = lazy(() => import('./BiggestLine'))

export function HeadLine(p: { off: boolean; site: string; from: string; to: string; series: readonly Point[] }) {
  if (p.off) return null
  return (
    <Suspense fallback={null}>
      <BiggestLine site={p.site} from={p.from} to={p.to} labels={p.series.map((x) => x.t)} visitors={p.series.map((x) => x.visitors)} />
    </Suspense>
  )
}
