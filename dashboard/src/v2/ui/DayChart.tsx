// The period's visitors against the usual band, drawn the way the walkthrough draws it: a smooth grey line, lit
// where it rose above the band, the band in soft white, the hours still to come shaded, and a dot that pulses at
// "now". The line never runs into hours that have not happened. Hovering reads one point in the line above.
import { useEffect, useRef, useState } from 'react'
import type { Bucket } from '../../lib/api'
import { copy } from '../briefing/copy'
import { niceStep, smooth, type XY } from '../briefing/geometry'

export interface ChartPoint {
  /** Where on the axis (in buckets from its start). */
  i: number
  /** The bucket's name for the readout: "15:00", "Fri 9 Oct". */
  name: string
  /** Its x-axis label, when it has one. */
  tick?: string
  v: number
  lo: number
  hi: number
}

export interface Down {
  /** From and to, in buckets from the axis start. */
  a: number
  b: number
  min: number
  now: boolean
}

export interface ChartIn {
  points: ChartPoint[]
  /** How many buckets the axis spans (the hours still to come are shaded). */
  span: number
  /** Whether the last point is "now": it pulses, and what is to its right is shaded. */
  live: boolean
  band: boolean
  usualLabel: string
  unit: string
  bucket: Bucket
  downs: Down[]
  notes: { i: number; text: string }[]
  /** The label over the biggest rise: "Hacker News · 2.4× a usual hour". */
  rise?: { i: number; text: string }
}

const H = 180

/** The text over the chart: the standing note, or the point under the pointer. */
export function chartNote(c: ChartIn, at: number | null): string {
  if (at !== null && c.points[at]) {
    const p = c.points[at]
    return copy.chartRead(p.name, String(p.v), String(p.lo), String(p.hi))
  }
  const up = c.points.filter((p) => c.band && p.v > p.hi).length
  const dn = c.points.filter((p) => c.band && p.v < p.lo).length
  if (!c.band) return ''
  if (up) return copy.aboveBand(up, c.points.length, c.unit)
  if (dn) return copy.belowBand(dn, c.unit)
  return copy.withinBand
}

export function HeroChart({ c, at, onAt }: { c: ChartIn; at: number | null; onAt: (i: number | null) => void }) {
  const box = useRef<SVGSVGElement>(null)
  const [W, setW] = useState(900)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setW(Math.max(260, el.clientWidth || 900))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ph = W < 500
  const L = ph ? 8 : 36
  const Rr = ph ? 8 : 10
  const T = ph ? 18 : 30
  const B = H - 22
  const X = (i: number) => L + ((W - L - Rr) * (i + 0.5)) / Math.max(1, c.span)
  const pts = c.points
  const mx = Math.max(1, ...pts.map((p) => p.v), ...(c.band ? pts.map((p) => p.hi) : [])) * 1.15
  const Y = (v: number) => B - ((B - T) * v) / mx
  const step = niceStep(mx)
  const grid: number[] = []
  for (let g = 0; g < mx; g += step) grid.push(g)
  const line: XY[] = pts.map((p) => [X(p.i), Y(p.v)])
  const lineD = smooth(line)
  const bandTop = smooth(pts.map((p) => [X(p.i), Y(p.hi)] as XY))
  const bandBot = smooth(pts.map((p) => [X(p.i), Y(p.lo)] as XY).reverse())
  const last = pts[pts.length - 1]
  const nowX = last ? X(last.i) : 0
  const lit = pts.flatMap((p, i) => (c.band && p.v > p.hi ? [[Math.max(0, i - 1), Math.min(pts.length - 1, i + 1)] as const] : []))
  const every = Math.max(1, Math.ceil(c.span / (ph ? 3 : 7)))
  const kfmt = (g: number) => (g >= 1000 ? `${g / 1000}k` : String(g))
  return (
    <svg
      ref={box}
      className="chart"
      id="chart"
      preserveAspectRatio="none"
      viewBox={`0 0 ${W} ${H}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - r.left) / r.width) * W
        let best = 0
        pts.forEach((p, i) => {
          if (Math.abs(X(p.i) - x) < Math.abs(X(pts[best].i) - x)) best = i
        })
        onAt(pts.length ? best : null)
      }}
      onPointerLeave={() => onAt(null)}
    >
      {grid.map((g) => (
        <g key={g}>
          <line x1={L} x2={W - Rr} y1={Y(g)} y2={Y(g)} stroke="var(--mk-grid)" />
          {!ph && (
            <text x={0} y={Y(g) + 4} fill="var(--mk-axis)" fontSize="12">
              {kfmt(g)}
            </text>
          )}
        </g>
      ))}
      {c.band && pts.length > 1 && <path d={`${bandTop} L${bandBot.slice(1)} Z`} fill="rgba(255,255,255,.055)" />}
      {c.band && !ph && pts.length > 1 && (
        <text x={X(pts[Math.floor(pts.length * 0.08)].i)} y={Y(pts[Math.floor(pts.length * 0.08)].hi) - 8} fill="var(--mk-axis)" fontSize="12">
          {c.usualLabel}
        </text>
      )}
      {c.downs.map((d) => {
        const x1 = L + ((W - L - Rr) * d.a) / c.span
        const w = Math.max(3, ((W - L - Rr) * (d.b - d.a)) / c.span)
        return (
          <g key={d.a}>
            <rect x={x1} y={T} width={w} height={B - T} fill="rgba(255,107,107,.16)" />
            <text x={Math.min(x1 + w + 5, W - 120)} y={T + 14} fill="var(--mk-red)" fontSize="12" fontWeight="600">
              {copy.downLabel(d.min, d.now)}
            </text>
          </g>
        )
      })}
      {c.live && last && <rect x={nowX} y={T} width={Math.max(0, W - Rr - nowX)} height={B - T} fill="rgba(10,11,12,.4)" />}
      {pts.length > 1 && (
        <>
          <path d={`${lineD} L${X(last.i)},${B} L${X(pts[0].i)},${B} Z`} fill="rgba(255,255,255,.03)" />
          <path d={lineD} fill="none" stroke="var(--mk-muted)" strokeWidth="2" strokeLinejoin="round" />
          {lit.map(([a, b], k) => (
            <path key={k} d={smooth(line.slice(a, b + 1))} fill="none" stroke="var(--mk-lime)" strokeWidth="2.4" strokeLinejoin="round" />
          ))}
        </>
      )}
      {last && c.live && (
        <circle cx={nowX} cy={Y(last.v)} r="4.5" fill={last.v > last.hi && c.band ? 'var(--mk-lime)' : 'var(--mk-text)'}>
          <animate attributeName="r" values="4;7;4" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      {c.rise && !(ph && c.downs.length > 0) && pts[c.rise.i] && (
        <g>
          <line x1={X(pts[c.rise.i].i)} x2={X(pts[c.rise.i].i)} y1={Y(pts[c.rise.i].v) - 6} y2={Math.max(T - 6, Y(pts[c.rise.i].v) - 24)} stroke="var(--mk-lime)" />
          <text x={Math.min(X(pts[c.rise.i].i) + 6, W - Rr - c.rise.text.length * 7.4)} y={Math.max(T - 8, Y(pts[c.rise.i].v) - 27)} fill="var(--mk-lime)" fontSize="12" fontWeight="600">
            {c.rise.text}
          </text>
        </g>
      )}
      {c.notes.map((n) => (
        <path key={`${n.i}${n.text}`} d={`M${X(n.i) - 6} ${B - 1}h12l-6-10z`} fill="#f0c64a">
          <title>{n.text}</title>
        </path>
      ))}
      {c.points.map((p) =>
        p.tick && p.i % every === 0 ? (
          <text key={p.i} x={ph ? Math.max(20, Math.min(W - 20, X(p.i))) : X(p.i)} y={B + 17} fill="var(--mk-axis)" fontSize="12" textAnchor="middle">
            {p.tick}
          </text>
        ) : null,
      )}
      {at !== null && pts[at] && (
        <>
          <line x1={X(pts[at].i)} x2={X(pts[at].i)} y1={T} y2={B} stroke="var(--mk-text)" strokeOpacity=".35" />
          <circle cx={X(pts[at].i)} cy={Y(pts[at].v)} r="4" fill="var(--mk-text)" />
        </>
      )}
    </svg>
  )
}
