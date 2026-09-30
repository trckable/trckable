// The row on top of a chart tab: what to read it by on the left (a key, a
// figure), the control on the right. The tab itself is the title.
import type { ReactNode } from 'react'
import './charts.css'

export function ChartHead({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  return (
    <div className="kit-head">
      {start}
      {end && <span className="kit-head-end">{end}</span>}
    </div>
  )
}
