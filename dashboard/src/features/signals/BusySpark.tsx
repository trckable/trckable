// The last hour in small: a lime line over a soft grey band of the usual (the main chart's own look and curve),
// and a live dot at the end while it lasts. Decorative: the number beside it says it in words.
import { segments, stretch, type Pt } from '../../v2/ui/smooth'
import type { Surge } from './surge'

const W = 240
const H = 44
const PAD = 4

export function BusySpark({ surge }: { surge: Surge }) {
  const series = surge.story?.series
  if (!series || series.length < 2) return null
  // The band is the usual a quarter either way: the rule the main chart's own band falls back on.
  const lo = Math.floor(surge.usual * 0.75)
  const hi = Math.ceil(surge.usual * 1.25) + 1
  const top = Math.max(...series, hi, 1) * 1.1
  const x = (i: number) => (i * W) / (series.length - 1)
  const y = (v: number) => H - PAD - (v / top) * (H - 2 * PAD)
  const pts: Pt[] = series.map((v, i) => [x(i), y(v)])
  const line = stretch(pts, segments(pts), 0, pts.length - 1)
  const last = pts[pts.length - 1]
  return (
    <div className="bz-spark" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <rect className="band" x="0" width={W} y={y(hi)} height={Math.max(2, y(lo) - y(hi))} rx="3" />
        <path className="ln" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      {!surge.ended && <i className="dot" style={{ top: `${(last[1] / H) * 100}%` }} />}
    </div>
  )
}
