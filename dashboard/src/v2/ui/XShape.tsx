// The shape of the period: people over time as one line over a faint fill, with its top, middle and bottom on the left
// and three times underneath. A drawing of what the table below adds up to, not a chart to read values from.
import { fmtInt } from '../../lib/format'
import type { Shape } from '../explore/types'

const W = 520
const H = 130

export function XShape({ shape }: { shape: Shape }) {
  const { pts } = shape
  const top = Math.max(1, ...pts)
  const mx = top * 1.12
  const x = (i: number) => (W * i) / (pts.length - 1)
  const y = (v: number) => H - 4 - ((H - 12) * v) / mx
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  return (
    <div className="shp">
      <div className="yl">
        <span>{fmtInt(top)}</span>
        <span>{fmtInt(top / 2)}</span>
        <span>{fmtInt(0)}</span>
      </div>
      <div className="sv">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1="0" x2={W} y1={y(top * t).toFixed(1)} y2={y(top * t).toFixed(1)} stroke="#1d1f23" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={`0,${H} ${line} ${W},${H}`} fill="rgba(255,255,255,.04)" />
          <polyline points={line} fill="none" stroke="#c6ff3a" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="xl">
          {shape.x.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
