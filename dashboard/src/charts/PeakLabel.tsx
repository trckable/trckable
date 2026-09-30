// The chart's axis-label anchoring and its one label on the line: the peak.
/** Where an axis label sits on its point: the first starts there and the
 *  last ends there, so neither runs off the chart; the rest are centred. */
export function anchorAt(i: number, n: number): 'start' | 'middle' | 'end' {
  if (i === 0) return 'start'
  if (i === n - 1) return 'end'
  return 'middle'
}

/** The one label on the line: the peak's value and when, kept inside the
 *  chart at either edge. On a column there is no point to mark: just the
 *  figure, above it. */
export function PeakLabel({ x, y, w, text, padL, color = 'var(--accent)', dot = true }: { x: number; y: number; w: number; text: string; padL: number; color?: string; dot?: boolean }) {
  let anchor: 'start' | 'middle' | 'end' = 'middle'
  let dx = 0
  if (x > w - 90) {
    anchor = 'end'
    dx = -8
  } else if (x < padL + 90) {
    anchor = 'start'
    dx = 8
  }
  return (
    <g className="chart-peak" aria-hidden="true">
      {dot && <circle cx={x} cy={y} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />}
      <text x={x + dx} y={Math.max(12, y - (dot ? 10 : 6))} textAnchor={anchor} fontSize="12" fontWeight="600" fill="var(--text)">
        {text}
      </text>
    </g>
  )
}
