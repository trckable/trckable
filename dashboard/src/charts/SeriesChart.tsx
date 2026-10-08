// Series over time on one axis: stacked areas (parts of a whole: where visits
// came from) or plain lines (things compared: new vs returning). Hovering or
// arrowing to a bucket shows every series' value there.
import { useDraw } from '../lib/motion'
import '../kit/draw.css'
import { anchorOf, stack, stackPeak, niceScale, tickIndexes } from './scale'
import { Tip } from './Tip'
import { useHover } from './useHover'
import { useWidth } from './useWidth'

export interface Series {
  label: string
  color: string
  values: number[]
}

const PAD_L = 36
const PAD_R = 8
const PAD_T = 8
const AXIS_H = 22

export function SeriesChart(p: {
  series: Series[]
  labels: string[] // x labels, one per bucket, already formatted
  stacked?: boolean
  height?: number
  label: string // what the chart shows, for screen readers
  fmt: (n: number) => string
  tipTitle: (i: number) => string
}) {
  const { ref, w } = useWidth<HTMLDivElement>()
  const draw = useDraw()
  const h = p.height ?? 190
  const n = p.labels.length
  const pw = Math.max(1, w - PAD_L - PAD_R)
  const ph = h - PAD_T - AXIS_H
  const peak = p.stacked ? stackPeak(p.series.map((s) => s.values)) : Math.max(0, ...p.series.flatMap((s) => s.values))
  const { max, ticks } = niceScale(peak)
  const x = (i: number) => PAD_L + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw)
  const y = (v: number) => PAD_T + ph - (v / max) * ph
  const hover = useHover(n, PAD_L, pw)
  const layers = stack(p.series.map((s) => s.values))
  const path = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = (y0: number[], y1: number[]) => {
    const back = y0.map((_, j) => y0.length - 1 - j).map((i) => `L${x(i).toFixed(1)},${y(y0[i]).toFixed(1)}`)
    return path(y1) + back.join('') + 'Z'
  }
  const at = hover.i
  return (
    <div ref={ref} className="kit-chart">
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={p.label}
        tabIndex={0}
        className="kit-svg"
        {...hover.handlers}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={w - PAD_R} y1={y(t)} y2={y(t)} className="kit-gridline" />
            <text x={PAD_L - 6} y={y(t) + 3.5} textAnchor="end" className="kit-axis">
              {p.fmt(t)}
            </text>
          </g>
        ))}
        {p.series.map((s, k) =>
          p.stacked ? (
            <path key={s.label} className={draw && 'draw-fill'} style={{ '--i': k } as React.CSSProperties} d={area(layers[k].y0, layers[k].y1)} fill={s.color} fillOpacity={0.85} stroke="var(--surface)" strokeWidth={0.75} />
          ) : (
            <path key={s.label} className={draw} pathLength="1" style={{ '--i': k } as React.CSSProperties} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
          ),
        )}
        {tickIndexes(n).map((i) => (
          <text key={i} x={x(i)} y={h - 6} textAnchor={anchorOf(i, n)} className="kit-axis">
            {p.labels[i]}
          </text>
        ))}
        {at !== null && (
          <g aria-hidden="true">
            <line x1={x(at)} x2={x(at)} y1={PAD_T} y2={PAD_T + ph} className="kit-cross" />
            {p.series.map((s, k) => (
              <circle key={s.label} cx={x(at)} cy={y(p.stacked ? layers[k].y1[at] : s.values[at])} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />
            ))}
          </g>
        )}
      </svg>
      <Tip
        width={w}
        at={
          at === null
            ? null
            : {
                x: x(at),
                y: PAD_T + 8,
                body: (
                  <>
                    <b>{p.tipTitle(at)}</b>
                    {p.series.map((s) => (
                      <span key={s.label} className="kit-tip-row">
                        <i style={{ background: s.color }} aria-hidden="true" />
                        {s.label}
                        <span className="num">{p.fmt(s.values[at] ?? 0)}</span>
                      </span>
                    ))}
                  </>
                ),
              }
        }
      />
    </div>
  )
}
