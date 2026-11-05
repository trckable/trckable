// The period's visitors drawn the way the walkthrough draws it: a grey line over a soft band of its usual, lit where it
// rose above the band (and red where it fell under), a pill where the run outside it began, the hours still to come
// shaded, and a dot that pulses at "now". Everything that happened at a time (notes, sales, outages, the moments) sits in
// one lane under the plot. The line never runs into hours that have not happened. Hovering reads one point in the line above.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { copy } from '../briefing/copy'
import { capital, readOf } from '../briefing/compare'
import { Tip } from '../../charts/Tip'
import { beforeName } from './beforeName'
import { downLabel } from './chartNote'
import { niceStep } from '../briefing/geometry'
import type { ChartGeo } from '../../features/moments/marks'
import { useGlide } from './glide'
import { FutureHatch } from './FutureHatch'
import { NoteMarks, SaleMarks, firstData } from './ChartMarks'
import { useLabelLayout } from './labelLayout'
import { segments, stretch, type Pt } from './smooth'
import type { ChartIn, ChartPoint } from './dayChartTypes'
import './chartLayer.css'

export type { ChartIn, ChartPoint, Down } from './dayChartTypes'

/** The layer starts this far down the chart, under the line of words that sits on its top edge. */
const LAYER_TOP = 26
/** The lane under the plot, above the axis, that the notes, sales, outages and moments share. */
const LANE = 26

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
  // The plot starts under the pill that says where the run outside the usual began, and ends over the lane of markers.
  const T = ph ? 28 : 34
  const B = H - 22 - LANE
  const lane = B + LANE / 2
  const span = Math.max(1, ph ? c.full : c.span)
  const X = (i: number) => L + ((W - L - Rr) * (i + 0.5)) / span
  const edge = (i: number) => L + ((W - L - Rr) * i) / span
  // The line glides from the last period's to this one's; the period before's follows it.
  const gv = useGlide('chart:v', c.points.map((p) => p.v))
  const gp = useGlide('chart:was', (c.compare?.vals ?? []).slice(0, span))
  const pts = c.points.map((p, i) => ({ ...p, v: gv[i] ?? p.v }))
  // A bucket is only called up or down where the site has a usual for it: while that is still being learned the line stays plain.
  const judged = (p: ChartPoint) => (c.band && (c.usual[p.i]?.hi ?? 0) >= 1 ? p.st : '')
  const f0 = /* before the first visit: shade only, no line, no comparison */ firstData(c.bucket, pts.map((p) => p.v))
  const drawn = pts.slice(f0)
  // The usual of each bucket of the period (the hours still to come too) as a band; a bucket with no usual to speak of has none, and only a chart with no band at all draws the period before as a line.
  const usual = c.usual.flatMap((u, i) => (u && c.band && i >= f0 && i < span && u.hi >= 1 ? [{ i, lo: u.lo, hi: u.hi }] : []))
  const banded = usual.length > 1
  const before = c.compare && !banded ? gp.map((v, i) => ({ i, v })).slice(f0) : []
  const top = Math.max(1, ...drawn.map((p) => p.v), ...before.map((p) => p.v))
  const mx = Math.max(top, Math.min(2 * top, ...(banded ? [Math.max(...usual.map((p) => p.hi))] : [0]))) * 1.15
  const Y = (v: number) => B - ((B - T) * v) / mx
  const step = niceStep(mx)
  const grid: number[] = []
  for (let g = 0; g < mx; g += step) grid.push(g)
  const fill = `chf${useId().replace(/\W/g, '')}`
  const last = pts[pts.length - 1]
  const nowEdge = c.live ? edge(Math.min(c.elapsed, span)) : edge(span)
  const every = Math.max(1, Math.ceil(span / (ph ? 3 : 7)))
  const kfmt = (g: number) => (g >= 1000 ? `${g / 1000}k` : String(g))
  const run = c.started && c.started.i >= f0 && pts[c.started.i] ? { p: pts[c.started.i], text: ph ? c.started.when : (c.started.down ? copy.downSince : copy.started)(c.started.when), dir: c.started.dir } : null
  const pillW = run ? Math.round(run.text.length * 6.8 + 18) : 0
  const pill = { w: pillW, h: 18, y: 4, x: run ? Math.max(L, Math.min(X(run.p.i) - pillW / 2, W - Rr - pillW)) : 0 }
  const ticks = c.axis.filter((p) => p.i < span && p.tick && p.i % every === 0)
  const geo: Pt[] = drawn.map((p) => [X(p.i), Y(p.v)])
  const segs = segments(geo)
  const line = geo.length ? stretch(geo, segs, 0, geo.length - 1) : ''
  const was: Pt[] = before.map((p) => [X(p.i), Y(p.v)])
  const nameAt = beforeName(c.compare ? capital(c.compare.name).length : 0, was, geo, W - Rr - 2)
  const hiLine: Pt[] = usual.map((p) => [X(p.i), Y(Math.min(p.hi, mx))])
  const loLine = usual.map((p): Pt => [X(p.i), Y(p.lo)]).reverse()
  const bandPath = banded ? `${stretch(hiLine, segments(hiLine), 0, hiLine.length - 1)}L${loLine[0][0]},${loLine[0][1]}${segments(loLine).join('')}Z` : ''
  const usualAt = hiLine[hiLine.length - 1]
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
          <line x1={L} x2={W - Rr} y1={Y(g)} y2={Y(g)} stroke="var(--mk-grid)" strokeDasharray={g ? '2 5' : undefined} />
          {!ph && (
            <text x={0} y={Y(g) + 4} fill="var(--mk-axis)" fontSize="12">
              {kfmt(g)}
            </text>
          )}
        </g>
      ))}
      {banded && (
        <>
          <path className="chusual" d={bandPath} fill="var(--mk-text)" fillOpacity=".08" />
          <text className="lbl lbl-halo" data-lbl="5" x={usualAt[0] - 2} y={usualAt[1] - 4} textAnchor="end" fill="var(--mk-axis)" fontSize="11">{copy.usualTag}</text>
        </>
      )}
      {c.compare && before.length > 1 && (
        <>
          <path className="chbefore" d={stretch(was, segments(was), 0, was.length - 1)} fill="none" stroke="var(--mk-muted)" strokeWidth="1.25" strokeDasharray="1 5" strokeLinecap="round" opacity=".75" />
          {nameAt && <text className="lbl lbl-halo" data-lbl="5" style={{ opacity: at !== null && pts[at] && Math.abs(pts[at].i - before[before.length - 1].i) <= 2 ? 0 : undefined }} x={nameAt.x} y={nameAt.y} textAnchor="end" fill="var(--mk-axis)" fontSize="12">{capital(c.compare.name)}</text>}
        </>
      )}
      {c.downs.map((d, k) => {
        const x1 = edge(d.a)
        const w = Math.max(3, edge(d.b) - x1)
        return (
          <g key={d.a} data-rv={x1}>
            <rect x={x1} y={B + 2} width={w} height="4" rx="2" fill="var(--mk-red)" />
            {k === c.downs.length - 1 && (
              <text x={Math.max(L, Math.min(x1 + w / 2, W - Rr - 40))} y={B + LANE - 3} textAnchor="middle" fill="var(--mk-red)" fontSize="11" fontWeight="600">
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
        <g>
          <defs>
            <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--mk-lime)" stopOpacity=".16" />
              <stop offset="1" stopColor="var(--mk-lime)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${geo[geo.length - 1][0]},${B} L${geo[0][0]},${B} Z`} fill={`url(#${fill})`} />
          <path d={line} fill="none" stroke="var(--mk-text)" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
          {pts.map((p, i) => {
            if (!judged(p) || i < f0) return null
            const k = i - f0
            return (
              <path
                key={p.i}
                className="chhot"
                d={stretch(geo, segs, Math.max(0, k - 1), Math.min(geo.length - 1, k + 1))}
                fill="none"
                stroke={judged(p) === 'up' ? 'var(--mk-lime)' : 'var(--mk-red)'}
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            )
          })}
          {c.live && (
            <g>
              <circle cx={X(last.i)} cy={Y(last.v)} r="4" fill="none" stroke={DOT[judged(last) || 'none']} strokeWidth="1.5">
                <animate attributeName="r" values="4;12" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".7;0" dur="1.8s" repeatCount="indefinite" />
              </circle>
              <circle cx={X(last.i)} cy={Y(last.v)} r="4.5" fill={DOT[judged(last) || 'none']} stroke="var(--mk-card)" strokeWidth="2" />
            </g>
          )}
        </g>
      )}
      {run && (
        <g data-rv={X(run.p.i)} data-run="">
          <line x1={X(run.p.i)} x2={X(run.p.i)} y1={pill.y + pill.h} y2={B} stroke={run.dir === 'up' ? 'var(--mk-lime)' : 'var(--mk-red)'} strokeOpacity=".7" strokeDasharray="1.5 3.5" strokeLinecap="round" />
          <rect x={pill.x} y={pill.y} width={pill.w} height={pill.h} rx={pill.h / 2} fill={run.dir === 'up' ? 'var(--mk-limeP)' : 'var(--mk-redP)'} stroke={run.dir === 'up' ? 'var(--mk-lime)' : 'var(--mk-red)'} strokeOpacity=".6" />
          <text x={pill.x + pill.w / 2} y={pill.y + pill.h / 2 + 4} textAnchor="middle" fill={run.dir === 'up' ? 'var(--mk-lime)' : 'var(--mk-red)'} fontSize="11.5" fontWeight="600">
            {run.text}
          </text>
        </g>
      )}
      <SaleMarks sales={c.sales ?? []} edge={edge} cy={lane} />
      <NoteMarks notes={c.notes} X={X} cy={lane} />
      {ticks.map((p) => (
        <text key={p.i} x={ph ? Math.max(20, Math.min(W - 20, X(p.i))) : X(p.i)} y={B + LANE + 17} fill="var(--mk-axis)" fontSize="12" textAnchor="middle">
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
      <div className="chlay-in">{layer({ x: X, y: (v: number) => Y(v) - LAYER_TOP, vals: pts.map((p) => p.v), w: W, top: T - LAYER_TOP, lane: lane - LAYER_TOP })}</div>
    </div>
  )
}
