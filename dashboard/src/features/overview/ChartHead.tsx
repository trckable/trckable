// The main chart's head: what it shows, a small "since" chip when it starts
// at the site's first visit (with a one-tap way to make that the period),
// and Replay in the corner.
import type { ReactNode } from 'react'
import { copy } from './copy'

export function ChartHead(p: { title: string; since?: string; onShowSince?: () => void; children?: ReactNode }) {
  return (
    <div className="chart-head">
      <h2>{p.title}</h2>
      {p.since && <span className="since-chip num">{copy.since(p.since)}</span>}
      <span className="chart-head-tools">
        {p.since && p.onShowSince && (
          <button type="button" className="btn ghost show-since" onClick={p.onShowSince} title={copy.showSinceTitle(p.since)}>
            {copy.showSince(p.since)}
          </button>
        )}
        {p.children}
      </span>
    </div>
  )
}
