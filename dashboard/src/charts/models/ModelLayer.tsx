// The try-out's drawings of the main chart's line: A a clean line, B bars, C the
// gap to the period before, D stacked by channel, E the pace. They replace what
// TimeChart draws inside the plot; the crosshair, the hover card, the notes and
// the axes stay TimeChart's own.
import type { Bucket } from '../../lib/api'
import { columnPath, columnWidth } from '../moneyPlot'
import { modelCopy } from './modelCopy'
import { curve, isWeekend, paceGap, paceSays, running, stackEdges } from './modelMath'
import { ModelLegend } from './ModelLegend'
import type { ChartModel, StackLayer } from './types'
import './models.css'

export interface LayerProps {
  model: ChartModel
  /** The chart's paint ids (TimeDefs). */
  id: string
  labels: string[]
  bucket: Bucket
  n: number
  x: (i: number) => number
  y: (v: number) => number
  /** The baseline's y, the plot's width and its left edge. */
  base: number
  plotW: number
  w: number
  top: number
  vals: number[]
  /** The period before, only when there is one to show. */
  ghost?: number[]
  layers?: StackLayer[]
  hover: number | null
  partialLast?: boolean
  tone: string
  fmt: (n: number) => string
}

const points = (a: number[], p: LayerProps) => a.map((v, i) => [p.x(i), p.y(v)])
const closed = (d: string, p: LayerProps) => (p.n ? `${d}L${p.x(p.n - 1).toFixed(1)} ${p.base}L${p.x(0).toFixed(1)} ${p.base}Z` : '')

export default function ModelLayer(p: LayerProps) {
  switch (p.model) {
    case 'B':
      return <Bars {...p} />
    case 'C':
      return p.ghost ? <Gap {...p} /> : <Clean {...p} />
    case 'D':
      return p.layers?.length ? <Stack {...p} layers={p.layers} /> : <Clean {...p} />
    case 'E':
      return p.ghost ? <Pace {...p} /> : <Clean {...p} />
    default:
      return <Clean {...p} />
  }
}

/** A line, the last step dotted while that bucket is still counting, and a ring on its end. */
function Line({ vals, p, width = 2 }: { vals: number[]; p: LayerProps; width?: number }) {
  const pts = points(vals, p)
  const tail = !!p.partialLast && p.n > 2
  const last = pts.length - 1
  return (
    <>
      <path d={curve(tail ? pts.slice(0, -1) : pts)} fill="none" stroke={p.tone} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />
      {tail && <path d={`M${pts[last - 1][0].toFixed(1)} ${pts[last - 1][1].toFixed(1)}L${pts[last][0].toFixed(1)} ${pts[last][1].toFixed(1)}`} fill="none" stroke={p.tone} strokeWidth={width} strokeDasharray="0.1 5.5" strokeLinecap="round" />}
      {p.partialLast && p.n > 1 && p.hover == null && <circle cx={pts[last][0]} cy={pts[last][1]} r="4" fill="var(--surface)" stroke={p.tone} strokeWidth="2" />}
      {p.n === 1 && <circle cx={pts[0][0]} cy={pts[0][1]} r="3.5" fill={p.tone} />}
    </>
  )
}

const Ghost = ({ vals, p }: { vals: number[]; p: LayerProps }) => <path d={curve(points(vals, p))} fill="none" stroke="var(--text-3)" strokeOpacity="0.6" strokeWidth="1.25" strokeDasharray="4 4" strokeLinejoin="round" />

/** A: one line over a soft fill, the period before a faint ghost. */
function Clean(p: LayerProps) {
  return (
    <g className="model-a">
      <path d={closed(curve(points(p.vals, p)), p)} fill={`url(#${p.id})`} />
      {p.ghost && <Ghost vals={p.ghost} p={p} />}
      <Line vals={p.vals} p={p} />
    </g>
  )
}

/** B: a bar a bucket; weekends softer, the one still counting hatched, the period before a tick on each bar. */
function Bars(p: LayerProps) {
  const bw = columnWidth(p.plotW, p.n)
  const hatch = p.id + '-hatch'
  const last = p.n - 1
  const reach = p.base - p.top
  return (
    <g className="model-b">
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={p.tone} fillOpacity="0.22" />
          <rect width="3" height="6" fill={p.tone} fillOpacity="0.85" />
        </pattern>
      </defs>
      {p.vals.map((v, i) => {
        if (!(v > 0)) return null
        const soft = isWeekend(p.labels[i], p.bucket === 'day')
        const live = !!p.partialLast && i === last
        const lit = p.hover == null || p.hover === i
        const opacity = (soft ? 0.5 : 0.92) * (lit ? 1 : 0.6)
        const h = Math.min(reach, Math.max(3, p.base - p.y(v)))
        return <path key={i} d={columnPath(p.x(i), p.base, h, bw)} fill={live ? `url(#${hatch})` : p.tone} fillOpacity={live ? 1 : opacity} />
      })}
      {p.ghost?.map((v, i) =>
        v > 0 ? <line key={i} className="model-tick" x1={p.x(i) - bw / 2 - 1} x2={p.x(i) + bw / 2 + 1} y1={p.y(v)} y2={p.y(v)} stroke="var(--text)" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round" /> : null,
      )}
    </g>
  )
}

/** C: this period against the one before; the gap between them green where ahead and red where behind. */
function Gap(p: LayerProps) {
  const prev = p.ghost ?? []
  const cur = points(p.vals, p)
  const was = points(prev, p)
  const roof = p.top - 4
  const above = (d: string) => `${d}L${p.x(p.n - 1).toFixed(1)} ${roof}L${p.x(0).toFixed(1)} ${roof}Z`
  const clipCur = p.id + '-gap-cur'
  const clipWas = p.id + '-gap-was'
  return (
    <g className="model-c">
      <defs>
        <clipPath id={clipCur}>
          <path d={above(curve(cur))} />
        </clipPath>
        <clipPath id={clipWas}>
          <path d={above(curve(was))} />
        </clipPath>
      </defs>
      {/* Ahead: under this period and above the one before. Behind: the other way round. */}
      <path d={closed(curve(cur), p)} fill="var(--up)" fillOpacity="0.3" clipPath={`url(#${clipWas})`} />
      <path d={closed(curve(was), p)} fill="var(--down)" fillOpacity="0.3" clipPath={`url(#${clipCur})`} />
      <path d={curve(was)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />
      <Line vals={p.vals} p={p} />
      <ModelLegend left={p.w - p.plotW + 4} right={p.w - 4} top={p.top + 4} items={[{ label: modelCopy.ahead, color: 'var(--up)' }, { label: modelCopy.behind, color: 'var(--down)' }, { label: modelCopy.previous, color: 'var(--text-3)', dash: true }]} />
    </g>
  )
}

/** D: the visitors stacked by channel, a hairline of the page between layers. */
function Stack(p: LayerProps & { layers: StackLayer[] }) {
  const edges = stackEdges(p.layers, p.n)
  const shape = (k: number) => {
    const upper = curve(points(edges[k + 1], p))
    const lower = curve(points(edges[k], p).reverse()).replace(/^M/, 'L')
    return `${upper}${lower}Z`
  }
  return (
    <g className="model-d">
      {p.layers.map((l, k) => (
        <path key={l.name} d={shape(k)} fill={l.color} fillOpacity="0.92" stroke="var(--surface)" strokeWidth="1.5" strokeLinejoin="round" />
      ))}
      <ModelLegend left={p.w - p.plotW + 4} right={p.w - 4} top={p.top + 4} items={[...p.layers].reverse().map((l) => ({ label: l.name, color: l.color }))} />
    </g>
  )
}

/** E: the running total against the period before, and how far ahead or behind it ends. */
function Pace(p: LayerProps) {
  const cur = running(p.vals)
  const was = running((p.ghost ?? []).slice(0, p.n))
  const gap = paceGap(p.vals, p.ghost ?? [])
  const end = cur.length ? [p.x(p.n - 1), p.y(cur[p.n - 1])] : [0, 0]
  const { word, paint } = paceSays(gap, p.fmt)
  return (
    <g className="model-e">
      <path d={closed(curve(points(cur, p)), p)} fill={`url(#${p.id})`} />
      {p.ghost && <Ghost vals={was} p={p} />}
      <Line vals={cur} p={{ ...p, partialLast: false }} />
      <circle cx={end[0]} cy={end[1]} r="4" fill={p.tone} stroke="var(--surface)" strokeWidth="2" />
      <text className="num model-pace" x={end[0] - 10} y={end[1] - 12} textAnchor="end" fontSize="12.5" fontWeight="600" fill={paint}>
        {word}
      </text>
    </g>
  )
}
