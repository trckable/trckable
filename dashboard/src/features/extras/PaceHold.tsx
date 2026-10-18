// The room of the Visitors tile's pace line, drawn empty: the tile keeps its height while the figure is on its way.
import './pace.css'

export function PaceHold() {
  return (
    <span className="kpi-pace num" aria-hidden="true">
      {'\u00a0'}
    </span>
  )
}
