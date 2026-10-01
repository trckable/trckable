// The marks are one chunk of their own (KpiMarks): a tile and the strip both
// ask for it here, so it loads once. A tile's mark has its room kept in the
// meantime, so nothing moves when it arrives.
import { lazy, Suspense, type ComponentProps } from 'react'

const Mark = lazy(() => import('./KpiMarks'))

export function KpiMark(p: ComponentProps<typeof Mark>) {
  const mark = <Suspense fallback={null}><Mark {...p} /></Suspense>
  return p.k === 'pay' ? mark : <span className="kpi-ico">{mark}</span>
}
