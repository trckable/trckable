// A smooth line over faded bars, a highlighted range, a dashed cursor with a
// tooltip, and a short axis. Hover or arrow keys pick a point; `tip` says what
// the point means. Decoration for the figure above it, which says the same in words.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { smooth } from '../charts/smooth'
import { kitWords } from './copy'
import './kit.css'

const W = 600
const H = 180
const AXIS = 22
const TOP = 10

export type TrendProps = {
  values: number[]
  /** Faded bars behind the line, a share of the line's value. */
  bars?: boolean
  /** First and last point of the highlighted range. */
  range?: [number, number]
  /** Axis words at points: { at: 3, label: 'Apr' }. */
  axis?: { at: number; label: string; strong?: boolean }[]
  tip?: (i: number) => ReactNode
  label?: string
}

/** An axis word at the first point starts there, at the last ends there, else is centred on it. */
function anchorOf(at: number, n: number) {
  if (at === 0) return 'start'
  return at === n - 1 ? 'end' : 'middle'
}

export function TrendChart({ values, bars = true, range, axis = [], tip, label = kitWords.chart }: TrendProps) {
  const [at, setAt] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  const n = values.length
  if (n < 2) return null
  const max = Math.max(...values, 1) * 1.06
  const x = (i: number) => 10 + (i * (W - 20)) / (n - 1)
  const y = (v: number) => TOP + (H - AXIS - TOP) * (1 - v / max)
  const line = smooth(values.map((v, i) => [x(i), y(v)]))
  const floor = H - AXIS
  const on = (i: number) => !!range && i >= range[0] && i <= range[1]
  const pick = at ?? (range ? Math.round((range[0] + range[1]) / 2) : null)
  const move = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1 })[e.key as 'ArrowRight' | 'ArrowLeft'] ?? 0
    if (!step) return
    e.preventDefault()
    setAt(Math.max(0, Math.min(n - 1, (at ?? 0) + step)))
  }
  const hover = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const px = ((clientX - r.left) / r.width) * W
    setAt(Math.max(0, Math.min(n - 1, Math.round((px - 10) / ((W - 20) / (n - 1))))))
  }
  return (
    // The arrow keys are the chart's own keyboard reading; the figure above has the numbers.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- a chart you can read with the arrow keys and the pointer
    <div ref={box} className="kit-trend" role="group" aria-label={label} tabIndex={0} onKeyDown={move} onMouseMove={(e) => hover(e.clientX)} onMouseLeave={() => setAt(null)} onBlur={() => setAt(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.42" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bars &&
          values.map((v, i) => {
            const top = y(v * 0.82)
            return <rect key={i} x={x(i) - 5} y={top} width="10" height={floor - top} rx="3" className={on(i) ? 'kit-bar on' : 'kit-bar'} style={on(i) ? { fill: `url(#${id}b)` } : undefined} />
          })}
        <path d={`${line}L${x(n - 1)} ${floor}L${x(0)} ${floor}Z`} fill={`url(#${id}a)`} />
        <path d={line} className="kit-trend-line" />
        {pick !== null && (
          <>
            <line x1={x(pick)} x2={x(pick)} y1={y(values[pick])} y2={floor} className="kit-cursor" />
            <circle cx={x(pick)} cy={y(values[pick])} r="5" className="kit-dot-pt" />
          </>
        )}
        {axis.map((a) => (
          <text key={a.at} x={x(a.at)} y={H - 4} textAnchor={anchorOf(a.at, n)} className={a.strong ? 'kit-axis strong' : 'kit-axis'}>
            {a.label}
          </text>
        ))}
      </svg>
      {tip && pick !== null && (
        <div className="kit-tip" style={{ left: `clamp(70px, ${(x(pick) / W) * 100}%, calc(100% - 70px))`, bottom: `${(1 - y(values[pick]) / H) * 100}%` }} role="status">
          {tip(pick)}
        </div>
      )}
    </div>
  )
}
