// The main chart's head: what it shows, and Replay in the corner.
import type { ReactNode } from 'react'

export function ChartHead(p: { title: string; children?: ReactNode }) {
  return (
    <div className="chart-head">
      <h2>{p.title}</h2>
      <span className="chart-head-tools">{p.children}</span>
    </div>
  )
}
