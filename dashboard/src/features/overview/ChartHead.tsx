// The main chart's head: what it shows, a small "since" chip when it starts
// at the site's first visit, and Replay in the corner.
import type { ReactNode } from 'react'
import { copy } from './copy'

export function ChartHead(p: { title: string; since?: string; children?: ReactNode }) {
  return (
    <div className="chart-head">
      <h2>{p.title}</h2>
      {p.since && <span className="since-chip num">{copy.since(p.since)}</span>}
      <span className="chart-head-tools">{p.children}</span>
    </div>
  )
}
