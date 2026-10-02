// The slot under the Visitors number, for the periods that have something to
// say there. The slot is decided here and kept by the tile (so the strip is as
// tall before the chip arrives as after); the chip is its own chunk.
import { lazy, Suspense, type ReactNode } from 'react'
import type { Filter, Point } from '../../lib/api'

const Hint = lazy(() => import('./HintChip'))

export function visitorsHint(p: { site: string; timezone: string; period: string; day: string; filters: Filter[]; visitors?: number; series: Point[] }): ReactNode | undefined {
  const today = p.period === 'today' || p.period === 'yesterday'
  // This month has a pace once three days have run.
  const month = p.period === 'mtd' && +p.day.slice(8, 10) >= 4
  if (!today && !month) return undefined
  const since = p.series.find((s) => s.visitors > 0)?.t.slice(0, 10)
  return (
    <Suspense fallback={null}>
      <Hint site={p.site} timezone={p.timezone} period={p.period} day={p.day} filters={p.filters} visitors={p.visitors} since={since} />
    </Suspense>
  )
}
