// The main chart, drawn like Live's: one glowing line over a soft fill, three
// y labels (0, half, top) and one label on the peak; a dashed ghost line for
// the comparison, an optional overlay (the money trail), and a scrubber.
// Revenue joins it two ways, never on a second axis: as a plot of its own
// under the line (revenue), or in the line's place (tone: money), as columns
// until nearly every day sells. Pure SVG; animation comes from useTween.
import { useEffect, useMemo, useRef, useState } from 'react'
import { markersFor } from '../features/notes/markers'
import { fmtCompact, fmtInt } from '../lib/format'
import { useTween } from '../lib/motion'
import { timeCopy } from './copy'
import { smooth } from './smooth'
import { bucketLabel, everyNth, fractionScale, peakIndex, threeScale } from './timeScale'
import { useCut } from './useCut'
import { ColumnsLayer, ModelLayer, NoteMarkers, RevenueLayer, TimeTip, preloadModels, preloadMoney } from './chartParts'
import { modelTop, running } from './models/modelMath'
import { SPLIT_GAP, SPLIT_H, columnWidth, isDense, moneyScale } from './moneyPlot'
import { NoteAdd } from './NoteAdd'
import { PeakLabel } from './PeakLabel'
import { PAD_L, PAD_T, AXIS_H, CHART_H, CHART_MS, tipLeft } from './plot'
import { TimeDefs } from './TimeDefs'
import { XLabels, YTicks } from './TimeGrid'
import { CursorMark, CursorPill } from './Cursor'
import type { TimeChartProps } from './timeProps'

export { bucketLabel, smooth }
export type { Pulse, TimeChartProps } from './timeProps'

export function TimeChart(p: TimeChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  const [picked, setHover] = useState<number | null>(null)
  // While Replay plays nothing is picked (and what was picked is let go of).
  if (p.locked && picked !== null) setHover(null)
  const hover = p.locked ? null : picked
  const [drag, setDrag] = useState(false)
  const money = p.tone === 'money'
  const tone = money ? 'var(--money)' : 'var(--accent)'
  const split = money ? undefined : p.revenue
  const STRIP = split ? SPLIT_H : 0
  const H = (p.height ?? CHART_H) + STRIP
  const plotH = H - PAD_T - AXIS_H - STRIP
  const fmt = p.fmt ?? fmtInt
  // Revenue's drawing is a chunk of its own, asked for by a chart that has revenue.
  const hasRevenue = money || !!split
  useEffect(() => {
    if (hasRevenue) preloadMoney()
  }, [hasRevenue])
  // A try-out model draws the line (never money's columns): its chunk comes first.
  const model = money ? null : (p.model ?? null)
  useEffect(() => {
    if (model) preloadModels()
  }, [model])

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
    const top = Math.max(model ? modelTop(model, p.values, before, p.stack) : Math.max(...p.values, ...before), ...(p.overlay?.values ?? []))
    const s = p.fraction ? fractionScale(top) : threeScale(Math.max(1, top))
    return { ticks: [0, s.step, s.max], max: s.max }
  }, [p.values, p.ghost, p.overlay, p.stack, n, money, p.fraction, model])
  const max = useTween(target.max, CHART_MS)
  const vals = useTween(p.values, CHART_MS)
  const track = model === 'E' ? running(vals) : vals // what the cursor rides: the running total in E
  const ghost = useTween(p.ghost ? pad(p.ghost, n) : zeros(n), CHART_MS)
  const over = useTween(p.overlay ? p.overlay.values : zeros(n), CHART_MS)
  const flat = useTween(model === 'D' && p.stack ? p.stack.flatMap((l) => pad(l.values, n)) : [], CHART_MS)
  const layers = model === 'D' && p.stack ? p.stack.map((l, k) => ({ ...l, values: flat.slice(k * n, (k + 1) * n) })) : undefined

  const plotW = w - PAD_L
  // Bars stand in a slot each, so the first and the last are not cut by the plot's edge.
  const slot = (i: number) => (model === 'B' ? ((i + 0.5) / n) * plotW : (i / (n - 1)) * plotW)
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : slot(i))
  // max is tweened, so on the very first frame it can still be 0 — and 0/0 is
  // a NaN in the middle of a path the browser then refuses to draw.
  const y = (v: number) => PAD_T + plotH - (v / (max || 1)) * plotH
  const line = (a: number[]) => smooth(a.map((v, i) => [x(i), y(v)]))
  const area = (a: number[]) => (a.length ? `${line(a)}L${x(a.length - 1).toFixed(1)} ${PAD_T + plotH}L${x(0).toFixed(1)} ${PAD_T + plotH}Z` : '')

  const columns = money && !isDense(p.values)
  const bw = columnWidth(plotW, n)
  const cols = { x, base: PAD_T + plotH, h: plotH, max, w: bw }
  const peak = peakIndex(p.values)
  const labelEvery = everyNth(Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90)))), p.bucket)

  const indexAt = (el: Element, clientX: number) => {
    const r = el.getBoundingClientRect()
    const rel = clientX - r.left - PAD_L
    const at = model === 'B' ? Math.floor((rel / plotW) * n) : Math.round((rel / plotW) * (n - 1))
    return Math.max(0, Math.min(n - 1, at))
  }

  const markers = useMemo(() => markersFor(p.notes ?? [], p.labels, p.bucket), [p.notes, p.labels, p.bucket])
  const scrub = p.scrub ?? null
  const quiet = !p.locked && !drag && hover == null // a picked day is drawn quietly unless hovered, dragged or played
  // Only these grey the far side of the cut: plain hovering never does.
  const dim = !!p.locked || drag || (scrub != null && hover == null)
  const { follow, release, onKey, marker, driven } = useCut({ ref, n, hover, scrub, locked: p.locked, vals: track, setHover, x, y })
  const leave = () => { release(); setHover(null); setDrag(false) }
  // Beside the point when there is room, never past either edge: on a phone
  // the card is nearly as wide as the chart, and it used to leave the screen.
  const compact = w < 600 // a phone: a slim card that covers little of the plot
  const tipW = compact ? 160 : 244
  const tipAt = hover != null ? tipLeft(x(hover), w, tipW) : 0
  const gradId = 'g-area'

  return (
    <div
      ref={ref}
      className="chart-wrap"
      data-story={p.story || undefined}
      data-model={model ?? undefined}
      data-locked={p.locked || undefined} data-quiet={quiet || undefined} data-dim={dim || undefined}
      style={{ height: H }}
      onPointerMove={(e) => {
        if (!n || p.locked) return
        // On a note's flag its own tooltip speaks; the day's would cover it.
        if ((e.target as Element).closest?.('.note-mark')) return setHover(null)
        const i = indexAt(e.currentTarget, e.clientX)
        if (drag && p.onScrub) {
          p.onScrub(i)
          return
        }
        follow(e.clientX - e.currentTarget.getBoundingClientRect().left, i)
        setHover(i)
      }}
      onPointerLeave={leave}
      onPointerDown={(e) => {
        if (!n || p.locked) return
        // A finger has no hover: touching the chart is hovering it.
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
        <TimeDefs id={gradId} w={w} h={H} base={PAD_T + plotH} padL={PAD_L} padT={PAD_T} tone={tone} />
        <YTicks ticks={target.ticks} y={y} w={w} padL={PAD_L} write={p.axis ?? fmtCompact} />
        <line x1={PAD_L} x2={w} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="var(--border)" />
        {/* While Replay plays, is dragged or has a day picked, what is past the cut goes grey: this copy shows through where the lit one is cut off. */}
        {dim && !p.story && !columns && <path d={line(track)} fill="none" stroke="var(--text-4)" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" clipPath={`url(#${gradId}-main)`} />}
        {dim && !p.story && columns && <g clipPath={`url(#${gradId}-main)`}><ColumnsLayer {...cols} id={gradId} values={vals} hover={null} grey /></g>}
        <g clipPath={`url(#${gradId}-main)`}>
        <g mask={`url(#${gradId}-dim)`}>
        <g style={{ opacity: p.overlay ? 0.35 : 1, transition: 'opacity .12s' }}>
          {model && <ModelLayer model={model} id={gradId} labels={p.labels} bucket={p.bucket} n={n} x={x} y={y} base={PAD_T + plotH} plotW={plotW} w={w} top={PAD_T} vals={vals} ghost={p.ghost ? ghost : undefined} layers={layers} hover={hover} partialLast={p.partialLast} tone={tone} fmt={fmt} />}
          {!model && columns && <ColumnsLayer {...cols} id={gradId} values={vals} ghost={p.ghost ? ghost : undefined} hover={hover} partialLast={p.partialLast} />}
          {!model && !columns && (
            <>
              <path d={area(vals)} fill={`url(#${gradId})`} />
              <path className={money ? 'chart-line money' : 'chart-line'} d={line(p.partialLast && n > 2 ? vals.slice(0, -1) : vals)} fill="none" stroke={tone} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {p.partialLast && n > 2 && (
                <path d={`M${x(n - 2).toFixed(1)} ${y(vals[n - 2]).toFixed(1)}L${x(n - 1).toFixed(1)} ${y(vals[n - 1]).toFixed(1)}`} fill="none" stroke={tone} strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
              )}
            </>
          )}
        </g>
        {p.ghost && !columns && !model && <path d={line(ghost)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />}
        {p.overlay && (
          <g>
            <path d={area(over)} fill={p.overlay.color} fillOpacity="0.22" />
            <path d={line(over)} fill="none" stroke={p.overlay.color} strokeWidth="2" strokeLinejoin="round" />
          </g>
        )}
        </g>
        </g>
        {/* Today, still counting: a point that breathes at the line's end, whole even on the plot's edge. */}
        {p.partialLast && n > 1 && hover == null && scrub == null && !columns && !model && (
          <g className="chart-now" aria-hidden="true">
            <circle cx={x(n - 1)} cy={y(vals[n - 1] ?? 0)} r="9" fill={tone} className="chart-now-halo" />
            <circle cx={x(n - 1)} cy={y(vals[n - 1] ?? 0)} r="4" fill={tone} stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        {p.story && <g clipPath={`url(#${gradId}-plot)`}><rect className="chart-dim chart-unknown" x={0} y={PAD_T} width={w + 16} height={plotH + STRIP} /></g>}
        {/* Replay's day: a solid line at the cut, drawn at the variable so it
            never lags the grey. The pointer's own cursor is CursorMark. */}
        {hover == null && <line className="chart-cut is-replay" x1={0} x2={0} y1={0} y2={PAD_T + plotH + STRIP} />}
        {scrub != null && n > 1 && hover == null && (
          <circle ref={marker} cx={0} cy={0} transform={driven ? undefined : `translate(${x(scrub)} ${y(track[scrub] ?? 0)})`} r={quiet ? 4 : 6} fill={tone} stroke="var(--surface)" strokeWidth={quiet ? 2 : 3} />
        )}
        {hover != null && <CursorMark x={x(hover)} y={y(track[hover] ?? 0)} top={0} bottom={PAD_T + plotH + STRIP} tone={money ? 'money' : undefined} dot={!columns && model !== 'B'} />}
        {peak >= 0 && hover == null && scrub == null && !p.overlay && model !== 'E' && (
          <PeakLabel x={x(peak)} y={y(vals[peak] ?? 0)} w={w} text={columns || model === 'B' ? fmt(p.values[peak]) : timeCopy.peak(fmt(p.values[peak]), bucketLabel(p.labels[peak], p.bucket))} padL={PAD_L} color={tone} dot={!columns && model !== 'B'} />
        )}
        {split && (
          <RevenueLayer {...split} id={gradId} x={x} w={w} top={PAD_T + plotH + SPLIT_GAP} values={pad(split.values, n)} hover={hover} partialLast={p.partialLast} dim={dim && !p.story} labelled={hover == null && scrub == null} />
        )}
        <XLabels labels={p.labels} bucket={p.bucket} every={labelEvery} x={x} y={H - 6} skip={hover != null ? x(hover) : null} />
      </svg>
      {/* Notes sit on the axis: a flag per day, its words on hover. */}
      <NoteMarkers markers={markers} x={x} top={PAD_T + plotH} width={w} />
      {hover != null && n > 0 && <TimeTip p={p} i={hover} left={tipAt} width={tipW} compact={compact} notes={markers.find((m) => m.i === hover)?.notes ?? []} />}
      {hover != null && n > 0 && p.onAddNote && <NoteAdd x={x(hover)} day={p.labels[hover].slice(0, 10)} label={bucketLabel(p.labels[hover], p.bucket, true)} onAdd={p.onAddNote} />}
      {/* Live pulse: each visit rises from the last point as a dot, a goal as
          a ring, a sale as a coin with its amount. It is decoration on top of
          numbers that are already right, so it never waits for anything. */}
      {n > 0 &&
        (p.pulses ?? []).map((pl) => (
          <span key={pl.id} className={'pulse-' + pl.kind} style={{ left: x(n - 1), top: y(track[n - 1] ?? 0) }} aria-hidden="true">
            {pl.label}
          </span>
        ))}
      {/* The bucket's date and time, pinned under the axis at the cursor. */}
      {hover != null && n > 0 && <CursorPill x={x(hover)} w={w} text={bucketLabel(p.labels[hover], p.bucket, true)} />}
    </div>
  )
}

const zeros = (n: number) => Array<number>(n).fill(0)
const pad = (a: number[], n: number) => (a.length >= n ? a.slice(0, n) : [...a, ...zeros(n - a.length)])
