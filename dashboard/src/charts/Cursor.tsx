// The cursor on a line chart: a quiet hairline from the top to the axis and
// the point on the line. It eases to the next bucket (one transform, so
// nothing is redrawn); Cursor.css.
import './Cursor.css'
import { PeakTag } from './PeakLabel'

export function CursorMark({ x, y, top, bottom, peak }: { x: number; y: number; top: number; bottom: number; peak?: string }) {
  return (
    <g className="cursor" aria-hidden="true" style={{ transform: `translateX(${x}px)` }}>
      <line y1={top} y2={bottom} />
      <g className="cursor-dot" style={{ transform: `translateY(${y}px)` }}>
        {peak && <PeakTag text={peak} room={y - top > 30} />}
        <circle r="4" />
      </g>
    </g>
  )
}

/** What the cursor is on, under the axis, sliding with it and never off the chart. */
export function CursorPill({ x, w, text }: { x: number; w: number; text: string }) {
  return (
    <span className="cursor-pill num" style={{ transform: `translateX(${Math.max(40, Math.min(x, w - 40))}px) translateX(-50%)` }}>
      {text}
    </span>
  )
}
