// What the chart draws for the site's main outcome besides the people line: bars on an axis of their own at the right
// (money, sign-ups or pageviews), and a small face on the line at each payment or sign-up. Both keep the `data-rv` of the
// x they sit at, so a replay brings them in as the line reaches them.
import { faceOf } from '../../components/visitor/face'
import { hueOf } from '../../lib/visitor'
import { apart, barScale, barWidth, type Face } from './outcome'
import type { ChartIn } from './dayChartTypes'

type Bars = NonNullable<ChartIn['bars']>

const BAR = { revenue: 'var(--mk-amber)', signups: 'var(--mk-amber)', views: 'var(--mk-text)' }
const SOFT = { revenue: 0.5, signups: 0.5, views: 0.1 }
const R = 9

interface Plot {
  X: (i: number) => number
  T: number
  B: number
  L: number
  W: number
  Rr: number
  span: number
  /** A phone draws the bars without their axis. */
  axis: boolean
}

export function OutcomeBars({ bars, g }: { bars: Bars; g: Plot }) {
  const n = Math.min(g.span, bars.vals.length)
  const vals = bars.vals.slice(0, n)
  const s = barScale(vals)
  const y = (v: number) => g.B - ((g.B - g.T) * v) / s.max
  const bw = barWidth(g.W - g.L - g.Rr, g.span)
  const col = BAR[bars.kind]
  return (
    <g aria-hidden="true" className="chbars" data-kind={bars.kind}>
      {g.axis &&
        s.ticks.map((t) => (
          <text key={t} x={g.W - g.Rr + 8} y={y(t) + 4} fontSize="12" fill={bars.kind === 'views' ? 'var(--mk-axis)' : col} fillOpacity={bars.kind === 'views' ? 1 : 0.85}>
            {bars.axis(t)}
          </text>
        ))}
      {vals.map((v, i) =>
        v > 0 ? (
          <rect key={i} data-rv={g.X(i)} x={g.X(i) - bw / 2} y={y(v)} width={bw} height={Math.max(1.5, g.B - y(v))} rx={Math.min(3, bw / 2)} fill={col} fillOpacity={SOFT[bars.kind]} />
        ) : null,
      )}
    </g>
  )
}

/** A face on the line at each payment or sign-up: the biggest of a bucket, "+N" for the rest. */
/** A box on the chart that a face keeps out of: the labels the line carries. */
export interface Keep {
  l: number
  r: number
  t: number
  b: number
}

const hits = (k: Keep, x: number, cy: number) => x + R + 6 > k.l && x - R - 6 < k.r && cy + R + 2 > k.t && cy - R - 6 < k.b

export function OutcomeFaces({ faces, id, X, Y, top, gap, keep }: { faces: Face[]; id: string; X: (i: number) => number; Y: (i: number) => number | null; top: number; gap: number; keep: Keep[] }) {
  const at = (f: Face) => Math.max(top + R, (Y(f.i) ?? 0) - R - 8)
  const shown = apart(faces, X, gap).filter((f) => Y(f.i) !== null && !keep.some((k) => hits(k, X(f.i), at(f))))
  return (
    <>
      {shown.map((f) => {
        const x = X(f.i)
        const base = Y(f.i) as number
        const cy = at(f)
        const clip = `${id}${f.i}`
        return (
          <g key={f.i} data-rv={x} className="chface">
            <line x1={x} x2={x} y1={cy + R} y2={base} stroke="var(--mk-amber)" strokeOpacity=".55" />
            <clipPath id={clip}>
              <circle cx={x} cy={cy} r={R} />
            </clipPath>
            <circle cx={x} cy={cy} r={R} fill={`hsl(${hueOf(f.id)} 55% 86%)`} />
            <svg x={x - R} y={cy - R} width={R * 2} height={R * 2} clipPath={`url(#${clip})`}>
              {faceOf(f.id)}
            </svg>
            <circle cx={x} cy={cy} r={R} fill="none" stroke="var(--mk-card)" strokeWidth="2" />
            {f.more > 0 && (
              <>
                <circle cx={x + R} cy={cy - R + 3} r="8" fill="var(--mk-card2)" stroke="var(--mk-amber)" />
                <text x={x + R} y={cy - R + 6.5} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="var(--mk-amber)">
                  +{f.more}
                </text>
              </>
            )}
            <title>{f.text}</title>
          </g>
        )
      })}
    </>
  )
}

/** What the plot shows, named once: the people line, the bars, and the faces when there are any. Over the plot's corner. */
export function OutcomeKey({ c }: { c: ChartIn }) {
  const bars = c.bars
  if (!bars) return null
  const faces = !!c.faces?.length && !!bars.faceLabel
  return (
    <span className="chout" aria-hidden="true">
      <span data-mark="line">{bars.people}</span>
      <span data-mark="bar" data-kind={bars.kind}>{bars.label}</span>
      {faces && <span data-mark="face">{bars.faceLabel}</span>}
    </span>
  )
}
