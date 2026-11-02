// A funnel as one shape that narrows from step to step, in layers that glow towards its middle. Every step keeps its name
// and number in plain text above it; the pill on each border says how many were lost there, red where it is worse than usual.
import NumberFlow from '@number-flow/react'
import { MotionConfig, motion } from 'motion/react'
import { useId, useState } from 'react'
import { useWidth } from '../../charts/useWidth'
import { fmtPct } from '../../lib/format'

export interface ShapeStep {
  name: string
  v: number
}

const H = 150
const SHORT = 84
const MIN_H = 10
const MIN_COL = 120
const LAYERS = [1, 0.68, 0.36]

/** The outline at one layer's share of the height: flat over a step, then a smooth fall into the next. */
export function outline(heights: number[], col: number, layer = 1, tall = H): string {
  const half = heights.map((h) => (h * layer) / 2)
  const mid = tall / 2
  const y = (i: number, sign: number) => mid + sign * half[i]
  let d = `M0,${y(0, -1)}`
  half.forEach((_, i) => {
    const x = i * col
    if (i === half.length - 1) d += `L${x + col},${y(i, -1)}`
    else d += `L${x + col * 0.72},${y(i, -1)}C${x + col},${y(i, -1)} ${x + col},${y(i + 1, -1)} ${x + col * 1.28},${y(i + 1, -1)}`
  })
  for (let i = half.length - 1; i >= 0; i--) {
    const x = i * col
    if (i === 0) d += `L0,${y(0, 1)}`
    else d += `L${x + col * 0.28},${y(i, 1)}C${x},${y(i, 1)} ${x},${y(i - 1, 1)} ${x - col * 0.28},${y(i - 1, 1)}`
  }
  return d + 'Z'
}

/** A share that is more than nothing never reads as 0.0%. */
export const shareText = (n: number) => (n > 0 && n < 0.001 ? '<0.1%' : fmtPct(n))

export function FunnelShape({ steps, label, red = -1, ghost, short }: { steps: ShapeStep[]; label: string; red?: number; ghost?: string; short?: boolean }) {
  const { ref, w: room } = useWidth<HTMLDivElement>()
  const id = 'fs' + useId().replace(/:/g, '')
  const [hot, setHot] = useState<number | null>(null)
  const top = steps[0]?.v || 1
  const tall = short ? SHORT : H
  const n = steps.length + (ghost ? 1 : 0)
  const w = Math.max(room, n * MIN_COL)
  const col = w / n
  const heights = steps.map((s) => Math.max(MIN_H, (s.v / top) * tall))
  const lost = steps.map((s, i) => (i && steps[i - 1].v ? 1 - s.v / steps[i - 1].v : 0))
  return (
    <MotionConfig reducedMotion="user">
      <div ref={ref} className={short ? 'fs short' : 'fs'} role="group" aria-label={label} onPointerLeave={() => setHot(null)}>
        <div className="fs-in" style={{ width: w }}>
          <ol className="fs-heads" style={{ gridTemplateColumns: `repeat(${n},1fr)` }}>
            {steps.map((s, i) => (
              <li key={s.name} className={hot === i ? 'on' : ''} onPointerEnter={() => setHot(i)}>
                <span title={s.name}>{s.name}</span>
                <b><NumberFlow value={s.v} /></b>
                <em>{i ? shareText(s.v / top) : ' '}</em>
              </li>
            ))}
            {ghost && (
              <li className="ghost">
                <span>{ghost}</span>
                <b>{'–'}</b>
                <em> </em>
              </li>
            )}
          </ol>
          <div className="fs-plot">
            <svg width={w} height={tall} aria-hidden="true">
              <defs>
                <linearGradient id={`${id}g`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="var(--mk-soft)" />
                  <stop offset="1" stopColor="var(--mk-soft)" stopOpacity=".55" />
                </linearGradient>
                <clipPath id={`${id}c`}>
                  <motion.rect x="0" y="0" height={tall} initial={{ width: 0 }} animate={{ width: w }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                </clipPath>
              </defs>
              {steps.map((s, i) => (
                <rect key={s.name} x={i * col} y="0" width={col} height={tall} className={hot === i ? 'fs-col on' : 'fs-col'} onPointerEnter={() => setHot(i)} />
              ))}
              <g clipPath={`url(#${id}c)`} pointerEvents="none">
                {LAYERS.map((l, n) => (
                  <path key={l} d={outline(heights, col, l, tall)} fill={`url(#${id}g)`} fillOpacity={[0.22, 0.34, 0.75][n]} />
                ))}
              </g>
              {ghost && <rect x={steps.length * col + 6} y="6" width={col - 12} height={tall - 12} rx="8" className="fs-ghost" />}
            </svg>
            {steps.map((_, i) =>
              i === 0 ? null : (
                <span key={i} className={`fs-drop${i === red ? ' red' : ''}`} style={{ left: i * col }}>
                  {`−${shareText(lost[i])}`}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}
