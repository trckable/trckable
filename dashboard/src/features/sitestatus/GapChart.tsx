// The last day of visits as a small chart in the surge story's look
// (signals/surge.css): the line, and the moment visits stopped marked, from
// "24 h ago" to now. Plain SVG in the page's tokens, named for assistive tech.
import { copy } from './copy'

const W = 600
const H = 120
const PAD = { l: 8, r: 8, t: 24, b: 8 }

export function GapChart({ slices, last, at }: { slices: number[]; last: string; at: number }) {
  const n = slices.length
  if (n < 2) return null
  const top = Math.max(...slices, 1) * 1.1
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1)
  const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b)
  const line = slices.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - PAD.b} L${x(0).toFixed(1)} ${H - PAD.b} Z`
  const edge = at > n * 0.7
  return (
    <figure className="sgm-chart gap-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={copy.chartLabel(last)} preserveAspectRatio="none">
        <path className="ar" d={area} />
        <path className="ln" pathLength="1" d={line} vectorEffect="non-scaling-stroke" />
        <line className="mark-line" x1={x(at)} x2={x(at)} y1={PAD.t - 8} y2={H - PAD.b} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={edge ? 'gap-mark end' : 'gap-mark'} style={{ left: `calc(12px + ${(x(at) / W).toFixed(4)} * (100% - 24px))` }}>
        {copy.stopMark(last)}
      </span>
      <figcaption>
        <span>{copy.dayAgo}</span>
        <span>{copy.nowEdge}</span>
      </figcaption>
    </figure>
  )
}
