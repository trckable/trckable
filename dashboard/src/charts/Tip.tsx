// The kit's tooltip: one box that follows the mark under the pointer (or the
// keyboard), clamped inside the chart so it never spills off a phone screen.
import type { ReactNode } from 'react'
import './Tip.css'

export interface TipAt {
  x: number // px inside the chart's box
  y: number
  body: ReactNode
}

export function Tip({ at, width }: { at: TipAt | null; width: number }) {
  if (!at) return null
  // Flip to the left of the mark past the middle, so it stays on screen.
  const left = at.x > width / 2 ? undefined : Math.max(0, at.x + 12)
  const right = at.x > width / 2 ? Math.max(0, width - at.x + 12) : undefined
  return (
    <div className="chart-tip kit-tip" style={{ left, right, top: Math.max(0, at.y - 12) }} role="status" aria-live="polite">
      {at.body}
    </div>
  )
}
