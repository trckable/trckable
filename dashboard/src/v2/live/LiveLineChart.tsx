// The half hour as one line, with its end dot: the same minutes, tooltip and axis as the bars, drawn in the walkthrough's lime.
// The line eases to each new answer, so an arriving visit extends it; the dot beats once for each arrival.
import type { ReactNode } from 'react'
import { smooth } from '../../charts/smooth'
import { useTween } from '../../lib/motion'

const W = 300
const TOP = 6
const SPAN = 92

/** The point of minute i of n at height h (a share of the tallest, 0 to 100) in the 300 by 100 box. */
export function pointOf(i: number, n: number, h: number): number[] {
  return [n <= 1 ? W / 2 : (i / (n - 1)) * W, TOP + ((100 - h) / 100) * SPAN]
}

interface Props {
  /** Each minute as a share of the tallest, as the bars have them. */
  heights: number[]
  /** Counts up with each visit that arrives. */
  beat: number
  hits?: ReactNode
  /** The minute under the pointer (or the focus): a thin guide and a dot mark it. */
  at?: number | null
  /** A thumb dragging across the chart: the pointer's place as a share of its width. */
  onScrub?: (e: React.PointerEvent<HTMLDivElement>) => void
}

/** How far in from each end the line fades (a share of the width): the left end in, the last stretch before the running minute out. */
const FADE_IN = 0.06
const FADE_OUT = 0.035

export function LiveLineChart({ heights, beat, hits, at = null, onScrub }: Props) {
  const hs = useTween(heights, 480)
  const n = hs.length
  const pts = hs.map((h, i) => pointOf(i, n, h))
  const line = smooth(pts)
  // The running minute is not over: it is drawn dashed, so a minute that just began does not read as a drop.
  const done = n > 2 ? smooth(pts.slice(0, -1)) : line
  const last = pts[n - 1] ?? [W, TOP + SPAN]
  const area = n ? `${line}L${W} 100L0 100Z` : ''
  // The solid line and its fill melt away at both ends; the running minute's dashed stretch and the dot stay whole.
  const tail = n > 2 ? pts[n - 2][0] / W : 1
  const on = at !== null && at >= 0 && at < n ? pts[at] : null
  // A minute's hit area is centred on its point, so the guide snaps to the nearest one.
  const reach = n > 1 ? 50 / (n - 1) : 0
  return (
    <div className="mline-in">
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="mline-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--mk-lime)' }} stopOpacity="0.2" />
            <stop offset="1" style={{ stopColor: 'var(--mk-lime)' }} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="mline-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset={FADE_IN} stopColor="currentColor" />
            <stop offset={Math.max(FADE_IN, tail - FADE_OUT)} stopColor="currentColor" />
            <stop offset={Math.max(FADE_IN, tail)} stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <mask id="mline-edges" style={{ maskType: 'alpha' }} maskUnits="userSpaceOnUse" x="-10" y="-30" width={W + 20} height="160">
            <rect x="-10" y="-30" width={W + 20} height="160" fill="url(#mline-fade)" />
          </mask>
        </defs>
        <g mask="url(#mline-edges)">
          <path d={area} fill="url(#mline-area)" />
          <path d={done} fill="none" className="mline-s" vectorEffect="non-scaling-stroke" />
        </g>
        {n > 2 && <path d={`M${pts[n - 2][0].toFixed(1)} ${pts[n - 2][1].toFixed(1)}L${last[0].toFixed(1)} ${last[1].toFixed(1)}`} fill="none" className="mline-s run" vectorEffect="non-scaling-stroke" />}
      </svg>
      <i key={beat} className={`mline-dot${beat ? ' beat' : ''}`} style={{ left: `${(last[0] / W) * 100}%`, top: `${last[1]}%` }} />
      {on && <i className="mline-guide" style={{ left: `${(on[0] / W) * 100}%` }} />}
      {on && <i className="mline-gdot" style={{ left: `${(on[0] / W) * 100}%`, top: `${on[1]}%` }} />}
      <div className="mhits" style={{ left: `-${reach}%`, right: `-${reach}%` }} onPointerMove={onScrub} onPointerDown={onScrub}>
        {hits}
      </div>
    </div>
  )
}
