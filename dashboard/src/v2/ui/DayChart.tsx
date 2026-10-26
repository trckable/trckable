// The period's visitors drawn the way the walkthrough draws it: a grey line, lit where it rose above its usual (and red
// where it fell under), the period before as a thin dashed line beside it, the hours still to come shaded, and a dot
// that pulses at "now". The line never runs into hours that have not happened. Hovering reads one point in the line above.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Bucket } from '../../lib/api'
import { copy } from '../briefing/copy'
import { capital, readOf, type Compare } from '../briefing/compare'
import { Tip } from '../../charts/Tip'
import { downLabel } from './chartNote'
import { niceStep } from '../briefing/geometry'
import type { Judged } from '../briefing/usual'
import type { ChartGeo } from '../../features/moments/marks'
import { useGlide } from './glide'
import { FutureHatch } from './FutureHatch'
import { NoteMarks, SaleMarks, firstData } from './ChartMarks'
import { useLabelLayout } from './labelLayout'
import { DRAWN, RevealTip, useReveal } from './RevealClip'
import './chartLayer.css'

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
  /** What was counted so far in a bucket that is still going (`v` is the pace it is on). */
  raw: number
  /** The same bucket of the period before; none without a comparison. */
  was: number | null
  /** How far the bucket stands from it, in percent; none while the bucket is still going or nobody was there before. */
  delta: number | null
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
  /** The label of each bucket of the axis, those still to come too. */
  axis: { i: number; tick: string }[]
  /** How many buckets the axis spans (the hours still to come are shaded), and how many the whole period has (a phone draws all of them). */
  span: number
  full: number
  /** Whether the last point is "now": it pulses, and what is to its right is shaded. */
  live: boolean
  /** Hours (with the part of the last one) passed so far; 0 when the period is over. */
  elapsed: number
  /** Whether the site's own history is enough to call a bucket above or below its usual (the green and red stretches, the label over a rise). */
  band: boolean
  /** The period before, to draw as a dashed line and to say in one line; none when it has too little before it. */
  compare: Compare | null
  /** What is said instead when a comparison was asked for and there is too little before it: when it begins. */
  noCompare: string | null
  /** The day the comparison (and with it the usual range) begins, when it has not yet: the standing line says it, never a count against a range that is not there. */
  startsOn: string | null
  overall: Judged
  unit: string
  bucket: Bucket
  downs: Down[]
  notes: { i: number; text: string }[]
  /** The label over the biggest rise: "Hacker News · 2.4× a usual hour". */
  rise?: { i: number; text: string; short: string }
  /** Sales on the line of the day: where on the axis (in buckets, with the part of the hour), and the amount as written. */
  sales?: { at: number; text: string; neg?: boolean }[]
}

/** The layer starts this far down the chart, under the line of words that sits on its top edge. */
const LAYER_TOP = 26
/** The lane under the markers' that the period's label ("Traffic · above usual") has to itself. */
const LABEL_LANE = 20

const DOT = { up: 'var(--mk-lime)', dn: 'var(--mk-red)', none: 'var(--mk-text)' }

/** `layer` draws over the plot, in pixels of the chart's own box: the moments' markers, the sources' pills, the busy band. */
export function HeroChart({ c, at, onAt, layer }: { c: ChartIn; at: number | null; onAt: (i: number | null) => void; layer?: (g: ChartGeo) => ReactNode }) {
  const box = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ W: 900, H: 180 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setSize({ W: Math.max(260, el.clientWidth || 900), H: el.clientHeight || 260 })
    read()
    const ro = new ResizeObserver(() => el.clientWidth > 0 && flushSync(read)) // out of sight (behind Live) no size: kept as it was; shown, applied before the paint
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { W, H } = size
  const ph = W < 500
  const L = ph ? 8 : 36
  const Rr = ph ? 8 : 10
  // With a layer over the plot, its markers have a lane of their own above it, and the period's label another under that.
  // On a phone the plot is short, so the lanes above it are tight: the markers' lane only (the label over a rise sits in it).
  const T = ph ? 14 + (layer ? LAYER_TOP + 4 : 0) : 30 + (layer ? LAYER_TOP + 6 + LABEL_LANE : 0)
  const B = H - 22
  const span = Math.max(1, ph ? c.full : c.span)
  const X = (i: number) => L + ((W - L - Rr) * (i + 0.5)) / span
  const edge = (i: number) => L + ((W - L - Rr) * i) / span
  // The line glides from the last period's to this one's; the period before's follows it.
  const gv = useGlide('chart:v', c.points.map((p) => p.v))
  const gp = useGlide('chart:was', (c.compare?.vals ?? []).slice(0, span))
  const pts = c.points.map((p, i) => ({ ...p, v: gv[i] ?? p.v }))
  const f0 = /* before the first visit: shade only, no line, no comparison */ firstData(c.bucket, pts.map((p) => p.v))
  const drawn = pts.slice(f0)
  const before = c.compare ? gp.map((v, i) => ({ i, v })).slice(f0) : []
  const mx = Math.max(1, ...drawn.map((p) => p.v), ...before.map((p) => p.v)) * 1.15
  const Y = (v: number) => B - ((B - T) * v) / mx
  const step = niceStep(mx)
  const grid: number[] = []
  for (let g = 0; g < mx; g += step) grid.push(g)
  const line = drawn.map((p) => `${X(p.i)},${Y(p.v)}`).join(' ')
  const last = pts[pts.length - 1]
  const nowEdge = c.live ? edge(Math.min(c.elapsed, span)) : edge(span)
  const every = Math.max(1, Math.ceil(span / (ph ? 3 : 7)))
  const kfmt = (g: number) => (g >= 1000 ? `${g / 1000}k` : String(g))
  const rise = c.rise && c.rise.i >= f0 && pts[c.rise.i] && !(ph && c.downs.length > 0) ? { p: pts[c.rise.i], text: ph ? c.rise.short : c.rise.text } : null
  // On a phone a label that would run off the edge is written to the left of its line.
  const flip = ph && rise !== null && X(rise.p.i) + 6 + rise.text.length * 8 > W - Rr - 4
  const ticks = c.axis.filter((p) => p.i < span && p.tick && p.i % every === 0)
  const geo = drawn.map((p) => [X(p.i), Y(p.v)])
  useReveal({ pts: geo, h: H })
  useLabelLayout({ pts: geo })
  const chart = (
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
      {c.compare && before.length > 1 && (
        <>
          <polyline className="chbefore" points={before.map((p) => `${X(p.i)},${Y(p.v)}`).join(' ')} fill="none" stroke="var(--mk-muted)" strokeWidth="1.25" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
          <text className="lbl" data-lbl="5" style={{ opacity: at !== null && pts[at] && Math.abs(pts[at].i - before[before.length - 1].i) <= 2 ? 0 : undefined }} x={Math.min(X(before[before.length - 1].i), W - Rr - 2)} y={Y(before[before.length - 1].v) - 7} textAnchor="end" fill="var(--mk-axis)" fontSize="12">
            {capital(c.compare.name)}
          </text>
        </>
      )}
      {c.downs.map((d, k) => {
        const x1 = edge(d.a)
        const w = Math.max(3, edge(d.b) - x1)
        return (
          <g key={d.a}>
            <rect x={x1} y={T} width={w} height={B - T} fill="var(--mk-redB)" />
            {k === c.downs.length - 1 && (
              <text x={Math.min(x1 + w + 5, W - 120)} y={T + 14} fill="var(--mk-red)" fontSize="12" fontWeight="600">
                {downLabel(c.downs, ph)}
              </text>
            )}
          </g>
        )
      })}
      {f0 > 0 && (
        <>
          <rect x={edge(0)} y={T} width={edge(f0) - edge(0)} height={B - T} fill="var(--mk-nowshade)" />
          {!ph && <text className="lbl" data-lbl="6" x={edge(0) + 6} y={T + 14} fill="var(--mk-axis)" fontSize="12">{copy.beforeFirst}</text>}
        </>
      )}
      {c.live && <FutureHatch x={nowEdge} y={T} width={Math.max(0, W - Rr - nowEdge)} height={B - T} />}
      {drawn.length > 0 && (
        <g {...DRAWN}>
          <polygon points={`${X(drawn[0].i)},${B} ${line} ${X(last.i)},${B}`} fill="var(--mk-areafill)" />
          <polyline points={line} fill="none" stroke="var(--mk-muted)" strokeWidth="2" strokeLinejoin="round" />
          {pts.map((p, i) =>
            p.st && i >= f0 ? (
              <polyline
                key={p.i}
                points={[Math.max(f0, i - 1), i, Math.min(pts.length - 1, i + 1)].map((j) => `${X(pts[j].i)},${Y(pts[j].v)}`).join(' ')}
                fill="none"
                stroke={p.st === 'up' ? 'var(--mk-lime)' : 'var(--mk-red)'}
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
        </g>
      )}
      {rise && (
        <g data-rv={X(rise.p.i)} data-rise="">
          <line x1={X(rise.p.i)} x2={X(rise.p.i)} y1={Y(rise.p.v) - 6} y2={T - 6} stroke="var(--mk-lime)" />
          <text className="lbl" data-lbl="2" x={flip ? X(rise.p.i) - 6 : Math.min(X(rise.p.i) + 6, W - Rr - rise.text.length * 7.4)} textAnchor={flip ? 'end' : undefined} y={T - 10} fill="var(--mk-lime)" fontSize="12" fontWeight="600">
            {rise.text}
          </text>
        </g>
      )}
      <RevealTip h={H} />
      <SaleMarks sales={c.sales ?? []} ph={ph} edge={edge} B={B} />
      <NoteMarks notes={c.notes} X={X} B={B} />
      {ticks.map((p) => (
        <text key={p.i} x={ph ? Math.max(20, Math.min(W - 20, X(p.i))) : X(p.i)} y={B + 17} fill="var(--mk-axis)" fontSize="12" textAnchor="middle">
          {p.tick}
        </text>
      ))}
      {at !== null && pts[at] && (
        <>
          <line x1={X(pts[at].i)} x2={X(pts[at].i)} y1={T} y2={B} stroke="var(--mk-text)" strokeOpacity=".35" />
          {before[at - f0] && <circle cx={X(pts[at].i)} cy={Y(before[at - f0].v)} r="3" fill="var(--mk-card)" stroke="var(--mk-muted)" strokeWidth="1.25" />}
          <circle cx={X(pts[at].i)} cy={Y(pts[at].v)} r="4" fill="var(--mk-text)" />
        </>
      )}
    </svg>
  )
  // The point under the pointer, read out next to it: "13:00 · 42 people · yesterday 31 · +35%".
  const hover = at !== null ? pts[at] : undefined
  const tip = <Tip width={W} at={hover ? { x: X(hover.i), y: Y(hover.v), body: readOf(hover.name, hover.raw, c.compare?.name ?? null, hover.was, hover.delta) } : null} />
  if (!layer) return <>{chart}{tip}</>
  return (
    <div className="chlay">
      {chart}
      {tip}
      <div className="chlay-in">{layer({ x: X, y: (v: number) => Y(v) - LAYER_TOP, vals: pts.map((p) => p.v), w: W })}</div>
    </div>
  )
}
