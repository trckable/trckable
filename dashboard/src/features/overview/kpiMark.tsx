// The marks are one chunk of their own (KpiMarks): a tile asks for it here, so
// it loads once, and its room is kept in the meantime, so nothing moves when
// it arrives. With `tile` it is the Revenue tile (a button that opens the
// providers) that comes, in the same chunk, and it keeps a tile's room.
import { lazy, Suspense, type ComponentProps } from 'react'

const Mark = lazy(() => import('./KpiMarks'))

export function KpiMark(p: ComponentProps<typeof Mark>) {
  const mark = (
    <Suspense fallback={p.tile ? <div className="kpi" aria-hidden="true" /> : null}>
      <Mark {...p} />
    </Suspense>
  )
  return p.tile ? mark : <span className="kpi-ico">{mark}</span>
}
