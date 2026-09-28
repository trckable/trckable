// Counts per category as columns on one axis (time to convert: sales per
// span). Each column shows its numbers on hover or with the arrow keys.
import { niceScale } from './scale'
import { Tip } from './Tip'
import { useHover } from './useHover'
import { useWidth } from './useWidth'

const PAD_L = 30
const PAD_R = 6
const PAD_T = 8
const AXIS_H = 22

export function ColumnChart(p: {
  values: number[]
  labels: string[]
  color: string
  label: string
  fmt: (n: number) => string
  tip: (i: number) => string
  height?: number
}) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const h = p.height ?? 190
  const n = p.values.length
  const pw = Math.max(1, w - PAD_L - PAD_R)
  const ph = h - PAD_T - AXIS_H
  const { max, ticks } = niceScale(Math.max(0, ...p.values))
  const slot = pw / Math.max(1, n)
  const bw = Math.min(56, slot * 0.64)
  const y = (v: number) => PAD_T + ph - (v / max) * ph
  const cx = (i: number) => PAD_L + slot * i + slot / 2
  const hover = useHover(n, PAD_L + slot / 2, pw - slot)
  const at = hover.i
  return (
    <div ref={ref} className="kit-chart">
      <svg width={w} height={h} role="img" aria-label={p.label} tabIndex={0} className="kit-svg" {...hover.handlers}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={w - PAD_R} y1={y(t)} y2={y(t)} className="kit-gridline" />
            <text x={PAD_L - 6} y={y(t) + 3.5} textAnchor="end" className="kit-axis">
              {p.fmt(t)}
            </text>
          </g>
        ))}
        {p.values.map((v, i) => (
          <g key={p.labels[i]}>
            <rect
              x={cx(i) - bw / 2}
              y={y(v)}
              width={bw}
              height={Math.max(0, PAD_T + ph - y(v))}
              rx={4}
              fill={p.color}
              opacity={at === null || at === i ? 1 : 0.55}
              onPointerEnter={() => hover.set(i)}
            />
            <text x={cx(i)} y={h - 6} textAnchor="middle" className="kit-axis">
              {p.labels[i]}
            </text>
          </g>
        ))}
      </svg>
      <Tip width={w} at={at === null ? null : { x: cx(at), y: y(p.values[at]), body: <b className="num">{p.tip(at)}</b> }} />
    </div>
  )
}
