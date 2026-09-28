// The one grid Full shows: its chart cards, then goals, revenue and the
// module cards, all in rows that fill (see useGridLayout). Off, it is only a
// wrapper with no box of its own, so Core's page flows as before.
import type { ReactNode } from 'react'
import { gridCopy } from './gridCopy'
import { useGridLayout } from './useGridLayout'
import './FullGrid.css'

export function FullGrid({ on, children }: { on: boolean; children: ReactNode }) {
  const ref = useGridLayout<HTMLElement>(on)
  if (!on) return <div className="grid-off">{children}</div>
  return (
    <section ref={ref} aria-label={gridCopy.region} className="full-grid rise" id="sec-charts">
      {children}
    </section>
  )
}
