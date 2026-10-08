// The small line in each All sites row.
import { isEmpty, NoData } from '../kit/NoData'

/** Stretches to its column; the line keeps its width however wide it gets. */
export function Spark({ values, color = 'var(--accent)', w = 140, h = 36 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (isEmpty(values)) return <NoData height={h} />
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * w : w / 2, h - 2 - (v / max) * (h - 4)] as const)
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join('')
  return (
    <svg className="all-spark" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={line + `L${w} ${h}L0 ${h}Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
