// The period's visitors against the usual band, drawn the way the walkthrough draws it: a grey line, lit where it rose
// above the band (and red where it fell under), the band in soft white, the hours still to come shaded, and a dot that
// pulses at "now". The line never runs into hours that have not happened. Hovering reads one point in the line above.
import { useEffect, useRef, useState } from 'react'
import type { Bucket } from '../../lib/api'
import { fmtInt } from '../../lib/format'
import { copy } from '../briefing/copy'
import { niceStep } from '../briefing/geometry'
import type { Band, Judged } from '../briefing/usual'

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
  st: Judged
  /** What was counted so far in a bucket that is still going, and the band over the same share of it. */
  raw: { v: number; lo: number; hi: number }
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
  /** Hours (with the part of the last one) passed so far; 0 when the period is over. */
  elapsed: number
  band: boolean
  /** The usual band of every bucket of the axis, the ones to come too. */
  ladder: Band[]
  overall: Judged
  usualLabel: string
  unit: string
  bucket: Bucket
  downs: Down[]
  notes: { i: number; text: string }[]
  /** The label over the biggest rise: "Hacker News · 2.4× a usual hour". */
  rise?: { i: number; text: string; short: string }
}

const DOT = { up: '#c6ff3a', dn: '#ff6b6b', none: '#ececee' }

/** The text over the chart: the standing note, or the point under the pointer. */
export function chartNote(c: ChartIn, at: number | null, down = false): string {
  if (at !== null && c.points[at]) {
    const p = c.points[at]
    return copy.chartRead(p.name, fmtInt(p.raw.v), fmtInt(p.raw.lo), fmtInt(p.raw.hi))
  }
  if (down) return copy.downRightNow
  if (!c.band) return ''
  const up = c.points.filter((p) => p.st === 'up').length
  const dn = c.points.filter((p) => p.st === 'dn').length
  if (c.overall === '' && c.bucket !== 'hour') return up + dn ? copy.normalOverall(up + dn, c.points.length) : copy.withinBand
  if (up) return copy.aboveBand(up, c.points.length, c.unit)
  if (dn) return copy.belowBand(dn, c.unit)
  return copy.withinBand
}

export function HeroChart({ c, at, onAt }: { c: ChartIn; at: number | null; onAt: (i: number | null) => void }) {
  const box = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ W: 900, H: 180 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setSize({ W: Math.max(260, el.clientWidth || 900), H: el.clientHeight || 260 })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { W, H } = size
  const ph = W < 500
  const L = ph ? 8 : 36
  const Rr = ph ? 8 : 10
  const T = ph ? 18 : 30
  const B = H - 22
  const span = Math.max(1, c.span)
  const X = (i: number) => L + ((W - L - Rr) * (i + 0.5)) / span
  const edge = (i: number) => L + ((W - L - Rr) * i) / span
  const pts = c.points
  const ladder = c.ladder.slice(0, span)
  const mx = Math.max(1, ...pts.map((p) => p.v), ...(c.band ? ladder.map((b) => b.hi) : [])) * 1.15
  const Y = (v: number) => B - ((B - T) * v) / mx
  const step = niceStep(mx)
  const grid: number[] = []
  for (let g = 0; g < mx; g += step) grid.push(g)
  const line = pts.map((p) => `${X(p.i)},${Y(p.v)}`).join(' ')
  const last = pts[pts.length - 1]
  const nowEdge = c.live ? edge(Math.min(c.elapsed, span)) : edge(span)
  const every = Math.max(1, Math.ceil(span / (ph ? 3 : 7)))
  const kfmt = (g: number) => (g >= 1000 ? `${g / 1000}k` : String(g))
  const bi = Math.min(ladder.length - 1, Math.floor(ladder.length * 0.08))
  const rise = c.rise && pts[c.rise.i] && !(ph && c.downs.length > 0) ? { p: pts[c.rise.i], text: ph ? c.rise.short : c.rise.text } : null
  const ticks = c.points.filter((p) => p.tick && p.i % every === 0)
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
        const i = Math.floor(((x - L) / (W - L - Rr)) * span)
        onAt(i >= 0 && i < pts.length ? i : null)
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
      {c.band && ladder.length > 1 && <polygon points={`${ladder.map((b, i) => `${X(i)},${Y(b.hi)}`).join(' ')} ${ladder.map((b, i) => `${X(i)},${Y(b.lo)}`).reverse().join(' ')}`} fill="rgba(255,255,255,.055)" />}
      {c.band && !ph && ladder.length > 1 && (
        <text x={X(bi)} y={Y(ladder[bi].hi) - 8} fill="var(--mk-axis)" fontSize="12">
          {c.usualLabel}
        </text>
      )}
      {c.downs.map((d) => {
        const x1 = edge(d.a)
        const w = Math.max(3, edge(d.b) - x1)
        return (
          <g key={d.a}>
            <rect x={x1} y={T} width={w} height={B - T} fill="rgba(255,107,107,.16)" />
            <text x={Math.min(x1 + w + 5, W - 120)} y={T + 14} fill="#ff6b6b" fontSize="12" fontWeight="600">
              {ph ? copy.downShort(d.min, d.now) : copy.downLabel(d.min, d.now)}
            </text>
          </g>
        )
      })}
      {c.live && <rect x={nowEdge} y={T} width={Math.max(0, W - Rr - nowEdge)} height={B - T} fill="rgba(10,11,12,.4)" />}
      {pts.length > 0 && (
        <>
          <polygon points={`${X(pts[0].i)},${B} ${line} ${X(last.i)},${B}`} fill="rgba(255,255,255,.03)" />
          <polyline points={line} fill="none" stroke="#8b8e94" strokeWidth="2" strokeLinejoin="round" />
          {pts.map((p, i) =>
            p.st ? (
              <polyline
                key={p.i}
                points={[Math.max(0, i - 1), i, Math.min(pts.length - 1, i + 1)].map((j) => `${X(pts[j].i)},${Y(pts[j].v)}`).join(' ')}
                fill="none"
                stroke={p.st === 'up' ? '#c6ff3a' : '#ff6b6b'}
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
            ) : null,
          )}
          {c.live && (
            <circle cx={X(last.i)} cy={Y(last.v)} r="4.5" fill={DOT[last.st || 'none']}>
              <animate attributeName="r" values="4;7;4" dur="1.6s" repeatCount="indefinite" />
            </circle>
          )}
          {rise && (
            <g>
              <line x1={X(rise.p.i)} x2={X(rise.p.i)} y1={Y(rise.p.v) - 6} y2={Math.max(T - 6, Y(rise.p.v) - 24)} stroke="#c6ff3a" />
              <text x={Math.min(X(rise.p.i) + 6, W - Rr - rise.text.length * 7.4)} y={Math.max(T - 8, Y(rise.p.v) - 27)} fill="#c6ff3a" fontSize="12" fontWeight="600">
                {rise.text}
              </text>
            </g>
          )}
        </>
      )}
      {c.notes.map((n) => (
        <path key={`${n.i}${n.text}`} d={`M${X(n.i) - 6} ${B - 1}h12l-6-10z`} fill="#f0c64a">
          <title>{n.text}</title>
        </path>
      ))}
      {ticks.map((p) => (
        <text key={p.i} x={ph ? Math.max(20, Math.min(W - 20, X(p.i))) : X(p.i)} y={B + 17} fill="var(--mk-axis)" fontSize="12" textAnchor="middle">
          {p.tick}
        </text>
      ))}
      {at !== null && pts[at] && (
        <>
          <line x1={X(pts[at].i)} x2={X(pts[at].i)} y1={T} y2={B} stroke="#ececee" strokeOpacity=".35" />
          <circle cx={X(pts[at].i)} cy={Y(pts[at].v)} r="4" fill="#ececee" />
        </>
      )}
    </svg>
  )
}
