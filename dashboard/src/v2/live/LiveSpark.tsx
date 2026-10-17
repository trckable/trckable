// Seven days as one line, the walkthrough's own: the tallest day near the top, the line in the muted grey.
export function LiveSpark({ vals }: { vals: number[] }) {
  const mx = Math.max(1, ...vals)
  const pts = vals.map((v, i) => `${((i / Math.max(1, vals.length - 1)) * 300).toFixed(1)},${(44 - (v / mx) * 40).toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" style={{ stroke: 'var(--mk-muted)' }} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
