// The chart's axis-label anchoring, and its one word on the line: "Peak",
// shown over the crosshair's dot only while the crosshair is on the busiest bucket.
/** Where an axis label sits on its point: the first starts there and the
 *  last ends there, so neither runs off the chart; the rest are centred. */
export function anchorAt(i: number, n: number): 'start' | 'middle' | 'end' {
  if (i === 0) return 'start'
  if (i === n - 1) return 'end'
  return 'middle'
}

/** Above the dot, or below it when the peak is too near the top of the plot. */
export function PeakTag({ text, room }: { text: string; room: boolean }) {
  return (
    <text className="cursor-peak" y={room ? -11 : 19} textAnchor="middle" fontSize="10.5" fill="var(--text-2)">
      {text}
    </text>
  )
}
