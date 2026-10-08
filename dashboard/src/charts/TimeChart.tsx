// The main chart, drawn like Live's: one glowing line over a soft fill, three
// y labels (0, half, top) and one label on the peak; a dashed ghost line for
// the comparison, an optional overlay (the money trail), and a scrubber.
// Revenue joins it two ways, never on a second axis: as a plot of its own
// under the line (revenue), or in the line's place (tone: money), as columns
// until nearly every day sells. Pure SVG; animation comes from useTween.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Annotation, Bucket } from '../lib/api'
import { markersFor } from '../features/notes/markers'
import { fmtCompact, fmtInt } from '../lib/format'
import { useDraw, useTween } from '../lib/motion'; import '../kit/draw.css'
import { timeCopy } from './copy'
import { smooth } from './smooth'
import { bucketLabel, everyNth, fractionScale, peakIndex, threeScale } from './timeScale'
import { useCut } from './useCut'
import { usePicked } from './usePicked'
import { usePin } from './usePin'
import { ColumnsLayer, NoteMarkers, Pulses, RevenueLayer, TimeTip, preloadMoney } from './chartParts'
import { SPLIT_GAP, SPLIT_H, columnWidth, isDense, moneyScale } from './moneyPlot'
import { NoteAdd } from './NoteAdd'
import { PeakLabel } from './PeakLabel'
import { NoData } from '../kit/NoData'; import { PAD_L, PAD_T, AXIS_H, CHART_H, CHART_MS, LANE_H, pad, tipLeft, zeros } from './plot'
import { TimeDefs } from './TimeDefs'
import { XLabels, YTicks } from './TimeGrid'
import { CursorMark, CursorPill } from './Cursor'

export { bucketLabel, smooth }

export interface TimeChartProps {
  labels: string[] // local wall-clock bucket starts ("2026-09-20T09:00")
  values: number[]
  ghost?: number[] // comparison period, aligned by index
  ghostLabels?: string[]
  overlay?: { values: number[]; color: string; name: string }
  metric: string
  bucket: Bucket
  scrub?: number | null
  partialLast?: boolean // the last bucket is still in progress (today / this hour)
  /** The values are revenue: the money colour, a money axis, columns (a line once nearly every bucket sold). */
  tone?: 'money'
  /** Writes a value for the hover card, the labels and a screen reader (default: a count). */
  fmt?: (n: number) => string
  /** The values are fractions (a rate): the axis steps in thousandths, not ones. */
  fraction?: boolean
  /** Writes one label on the y-axis (default: compact). */
  axis?: (n: number) => string
  /** Revenue under the line: its own plot with its own axis (its own scale, never a second axis). */
  revenue?: { values: number[]; fmt: (n: number) => string; axis: (n: number) => string; label: string; none: string }
  /** What a bucket's sales say, under its revenue ("3 sales · $149 new"); null when there were none. */
  saleNote?: (i: number) => string | null
  onScrub?: (i: number) => void
  height?: number
  /**
   * Extra lines for the hovered bucket: split bars (new vs returning, or in
   * cookieless mode a row saying it is off) and name/value rows. The chart
   * knows how to draw them; the dashboard knows what they mean.
   */
  detail?: (i: number) => {
    /** Split bars: how the bucket divides. tone colours the filled part, fmt writes the numbers. */
    splits?: { a: number; b: number; aLabel: string; bLabel: string; tone?: string; fmt?: (v: number) => string }[]
    /** short: the label on a phone's compact card. */
    rows?: { label: string; value: string; faint?: boolean; short?: string }[]
  } | null
  /** Notes pinned to days: a launch, a post, an outage. */
  notes?: Annotation[]
  /** Adds a note to a day, from the + at the top of the crosshair. */
  onAddNote?: (day: string) => void
  /** Live pulse: things arriving right now, drawn rising from the last point. */
  pulses?: Pulse[]
  /** Drawn over the plot with the chart's own scales: the moments (spikes, sales, firsts), their markers on a lane above the plot (`LANE_H`: its height). A chart with a layer, or telling a story, has the lane: the plot keeps its height and the chart grows by it. */
  layer?: (g: { x: (i: number) => number; y: (v: number) => number; vals: number[]; w: number }) => ReactNode
  /** Replay tells a story: the line ends at the playhead, the rest unknown. */
  story?: boolean
  /** Replay is playing: no hover, touch or keys until it pauses or ends. */
  locked?: boolean
}

// Replay's playhead (its line, dot and chip) is its own chunk: the first load does not carry it.
const ReplayLine = lazy(() => import('./ReplayHead').then((m) => ({ default: m.ReplayLine })))
const ReplayChip = lazy(() => import('./ReplayHead').then((m) => ({ default: m.ReplayChip })))

export type Pulse = { id: string; kind: 'visit' | 'goal' | 'sale'; label?: string }

export function TimeChart(p: TimeChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  const [hover, setHover] = usePicked(Math.min(p.values.length, p.labels.length), p.locked)
  const [drag, setDrag] = useState(false)
  const money = p.tone === 'money'; const draw = useDraw()
  const tone = money ? 'var(--money)' : 'var(--accent)'
  const split = money ? undefined : p.revenue
  const STRIP = split ? SPLIT_H : 0
  const top = PAD_T + (p.layer || p.story ? LANE_H : 0) // the plot starts under the lane
  const H = (p.height ?? CHART_H) + STRIP + top - PAD_T
  const plotH = H - top - AXIS_H - STRIP
  const base = top + plotH
  const fmt = p.fmt ?? fmtInt
  // Revenue's drawing is a chunk of its own, asked for by a chart that has revenue.
  const hasRevenue = money || !!split
  useEffect(() => {
    if (hasRevenue) preloadMoney()
  }, [hasRevenue])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = p.values.length
  const target = useMemo(() => {
    const before = (p.ghost ?? []).slice(0, n)
    if (money) return moneyScale(p.values, before)
    const high = Math.max(...p.values, ...before, ...(p.overlay?.values ?? []))
    const s = p.fraction ? fractionScale(high) : threeScale(Math.max(1, high))
    return { ticks: [0, s.step, s.max], max: s.max }
  }, [p.values, p.ghost, p.overlay, n, money, p.fraction])
  const max = useTween(target.max, CHART_MS)
  const vals = useTween(p.values, CHART_MS)
  const ghost = useTween(p.ghost ? pad(p.ghost, n) : zeros(n), CHART_MS)
  const over = useTween(p.overlay ? p.overlay.values : zeros(n), CHART_MS)

  const plotW = w - PAD_L
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  // max is tweened, so on the very first frame it can still be 0 — and 0/0 is
  // a NaN in the middle of a path the browser then refuses to draw.
  const y = (v: number) => base - (v / (max || 1)) * plotH
  // The line runs the whole period: along zero where there is no data yet.
  const line = (a: number[]) => smooth(a.map((v, i) => [x(i), y(v)]))
  const area = (a: number[]) => (a.length ? `${line(a)}L${x(a.length - 1).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z` : '')

  const columns = money && !isDense(p.values)
  const bw = columnWidth(plotW, n)
  const cols = { x, base, h: plotH, max, w: bw }
  const peak = peakIndex(p.values)
  const labelEvery = everyNth(Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90)))), p.bucket)

  const indexAt = (el: Element, clientX: number) => {
    const r = el.getBoundingClientRect()
    const rel = clientX - r.left - PAD_L
    return Math.max(0, Math.min(n - 1, Math.round((rel / plotW) * (n - 1))))
  }

  const markers = useMemo(() => markersFor(p.notes ?? [], p.labels, p.bucket), [p.notes, p.labels, p.bucket])
  const scrub = p.scrub ?? null
  const quiet = !p.locked && !drag && hover == null // a picked day is drawn quietly unless hovered, dragged or played
  const dim = !!p.locked || drag || (scrub != null && hover == null) // only these grey the far side of the cut: plain hovering never does
  const { follow, release, onKey, driven } = useCut({ ref, n, hover, scrub, locked: p.locked, setHover, x })
  const leave = () => { release(); setHover(null); setDrag(false) }
  const pin = usePin(ref, hover != null, leave)
  // Beside the point, never past either edge (on a phone the card is nearly as wide as the chart).
  const compact = w < 600 // a phone: a slim card that covers little of the plot
  const tipW = compact ? 160 : 244
  const tipAt = hover != null ? tipLeft(x(hover), w, tipW) : 0
  const gradId = 'g-area'

  return (
    <div
      ref={ref}
      className="chart-wrap"
      data-story={p.story || undefined}
      data-locked={p.locked || undefined} data-quiet={quiet || undefined} data-dim={dim || undefined}
      style={{ height: H }}
      onPointerMove={(e) => {
        if (!n || p.locked) return
        // On a note's flag its own tooltip speaks; the day's would cover it.
        if ((e.target as Element).closest?.('.note-mark, .moment-mark, .sv-span')) return setHover(null)
        const i = indexAt(e.currentTarget, e.clientX)
        if (drag && p.onScrub) {
          p.onScrub(i)
          return
        }
        follow(e.clientX - e.currentTarget.getBoundingClientRect().left, i)
        setHover(i)
      }}
      onPointerLeave={pin.leave}
      onPointerDown={(e) => {
        if (!n || p.locked) return
        pin.down(e)
        if (!p.onScrub) {
          setHover(indexAt(e.currentTarget, e.clientX))
          return
        }
        // Dragging moves Replay's day; the cut follows that day.
        setDrag(true)
        release()
        setHover(null)
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        p.onScrub(indexAt(e.currentTarget, e.clientX))
      }}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={leave}
    >
      {/* The picture is the svg; the note flags beside it are buttons, which
          a role="img" around them would hide from a screen reader. */}
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={timeCopy.chart(p.metric, n, fmt(Math.max(0, ...p.values)))}
        tabIndex={n ? 0 : -1}
        onKeyDown={p.locked ? undefined : onKey}
        onBlur={() => setHover(null)}
      >
        <TimeDefs id={gradId} w={w} h={H} base={base} padL={PAD_L} padT={top} tone={tone} />
        <YTicks ticks={target.ticks} y={y} w={w} padL={PAD_L} write={p.axis ?? fmtCompact} />
        <line x1={PAD_L} x2={w} y1={base} y2={base} stroke="var(--border)" />
        {/* While Replay plays, is dragged or has a day picked, what is past the cut goes grey: this copy shows through where the lit one is cut off. */}
        {dim && !columns && <path d={line(vals)} fill="none" stroke={p.story ? tone : 'var(--text-4)'} strokeOpacity={p.story ? 0.3 : 0.55} strokeWidth="1.5" strokeLinejoin="round" clipPath={`url(#${gradId}-main)`} />}
        {dim && columns && <g clipPath={`url(#${gradId}-main)`}><ColumnsLayer {...cols} id={gradId} values={vals} hover={null} grey /></g>}
        <g clipPath={`url(#${gradId}-main)`}>
        <g mask={`url(#${gradId}-dim)`}>
        <g style={{ opacity: p.overlay ? 0.35 : 1, transition: 'opacity .12s' }}>
          {columns ? (
            <ColumnsLayer {...cols} id={gradId} values={vals} ghost={p.ghost ? ghost : undefined} hover={hover} partialLast={p.partialLast} />
          ) : (
            <>
              <path className={draw && 'draw-fill'} d={area(vals)} fill={`url(#${gradId})`} />
              <path pathLength="1" className={`${money ? 'chart-line money' : 'chart-line'} ${draw}`} d={line(p.partialLast && n > 2 ? vals.slice(0, -1) : vals)} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {p.partialLast && n > 2 && (
                <path d={`M${x(n - 2).toFixed(1)} ${y(vals[n - 2]).toFixed(1)}L${x(n - 1).toFixed(1)} ${y(vals[n - 1]).toFixed(1)}`} fill="none" stroke={tone} strokeWidth="2" strokeDasharray="0.1 5.5" strokeLinecap="round" />
              )}
            </>
          )}
        </g>
        {p.ghost && !columns && <path d={line(ghost)} fill="none" stroke="var(--text-3)" strokeOpacity="0.6" strokeWidth="1.25" strokeDasharray="4 4" strokeLinejoin="round" />}
        {p.overlay && (
          <g>
            <path d={area(over)} fill={p.overlay.color} fillOpacity="0.22" />
            <path d={line(over)} fill="none" stroke={p.overlay.color} strokeWidth="2" strokeLinejoin="round" />
          </g>
        )}
        </g>
        </g>
        {/* Today, still counting: a ring at the line's end, whole even on the plot's edge. */}
        {p.partialLast && n > 1 && hover == null && scrub == null && !columns && (
          <circle cx={x(n - 1)} cy={y(vals[n - 1] ?? 0)} r="4" fill="var(--surface)" stroke={tone} strokeWidth="2" aria-hidden="true" />
        )}
        {p.story && <g clipPath={`url(#${gradId}-plot)`}><rect className="chart-dim chart-unknown" x={0} y={top} width={w + 16} height={plotH + STRIP} /></g>}
        {hover == null && <Suspense fallback={null}><ReplayLine id={gradId} tone={tone} bottom={base + STRIP} at={scrub != null && n > 1 ? scrub : null} driven={driven} quiet={quiet} x={x} y={y} vals={vals} /></Suspense>}
        {hover != null && <CursorMark x={x(hover)} y={y(vals[hover] ?? 0)} top={0} bottom={base + STRIP} tone={money ? 'money' : undefined} dot={!columns} />}
        {peak >= 0 && hover == null && scrub == null && !p.overlay && (
          <PeakLabel x={x(peak)} y={y(vals[peak] ?? 0)} w={w} text={columns ? fmt(p.values[peak]) : timeCopy.peak(fmt(p.values[peak]), bucketLabel(p.labels[peak], p.bucket))} padL={PAD_L} color={tone} dot={!columns} />
        )}
        {split && (
          <RevenueLayer {...split} id={gradId} x={x} w={w} top={base + SPLIT_GAP} values={pad(split.values, n)} hover={hover} partialLast={p.partialLast} dim={dim && !p.story} labelled={hover == null && scrub == null} />
        )}
        <XLabels labels={p.labels} bucket={p.bucket} every={labelEvery} x={x} y={H - 6} skip={hover != null ? x(hover) : null} />
      </svg>
      {/* Notes sit on the axis: a flag per day, its words on hover. */}
      <NoteMarkers markers={markers} x={x} top={base} width={w} />
      {hover == null && scrub != null && n > 1 && <Suspense fallback={null}><ReplayChip labels={p.labels} bucket={p.bucket} at={scrub} x={x} width={w} driven={driven} /></Suspense>}
      {hover != null && n > 0 && <TimeTip p={p} i={hover} left={tipAt} width={tipW} compact={compact} notes={markers.find((m) => m.i === hover)?.notes ?? []} />}
      {hover != null && n > 0 && p.onAddNote && <NoteAdd x={x(hover)} day={p.labels[hover].slice(0, 10)} label={bucketLabel(p.labels[hover], p.bucket, true)} onAdd={p.onAddNote} />}
      {/* Live pulse: things arriving now, rising from the last point: decoration on numbers that are already right. */}
      <Pulses pulses={p.pulses} n={n} x={x} y={y} vals={vals} />
      {p.layer?.({ x, y, vals, w })}{n > 0 && !p.story && !p.overlay && p.values.every((v) => v === 0) && <span className="chart-nodata" style={{ left: PAD_L, top, height: plotH }}><NoData /></span>}
      {/* The bucket's date and time, pinned under the axis at the cursor. */}
      {hover != null && n > 0 && <CursorPill x={x(hover)} w={w} text={bucketLabel(p.labels[hover], p.bucket, true)} />}
    </div>
  )
}
