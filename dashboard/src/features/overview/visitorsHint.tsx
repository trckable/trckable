// What the Visitors tile adds after its change for today and yesterday: how it
// compares with that weekday's usual. It sits on the change's own line (so the
// strip never changes height) and so only where the change is shown, which is
// when a comparison is on. The chip is its own chunk.
import { lazy, Suspense, type ReactNode } from 'react'
import type { Filter } from '../../lib/api'

const Hint = lazy(() => import('./HintChip'))

export function visitorsHint(p: { site: string; period: string; day: string; filters: Filter[] }): ReactNode | undefined {
  if (p.period !== 'today' && p.period !== 'yesterday') return undefined
  return (
    <Suspense fallback={null}>
      <Hint site={p.site} period={p.period} day={p.day} filters={p.filters} />
    </Suspense>
  )
}
