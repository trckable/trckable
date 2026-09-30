// The cursor on a line chart: a quiet dashed line in the series colour from the
// top to the axis (through every plot under it), and the point on the line with
// a soft halo. It eases to the next bucket (one transform, so nothing is
// redrawn); Cursor.css.
import './Cursor.css'

export function CursorMark({ x, y, top, bottom, tone, dot = true }: { x: number; y: number; top: number; bottom: number; tone?: 'money'; dot?: boolean }) {
  return (
    <g className={tone === 'money' ? 'cursor money' : 'cursor'} aria-hidden="true" style={{ transform: `translateX(${x}px)` }}>
      <line y1={top} y2={bottom} />
      {dot && (
        <g className="cursor-dot" style={{ transform: `translateY(${y}px)` }}>
          <circle className="cursor-halo" r="10" />
          <circle r="5" />
        </g>
      )}
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
