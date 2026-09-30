// The main chart, drawn like Live's: one line over a soft fill that fades out
// before the axis, three quiet y labels (0, half, top), and "Peak" only under
// the crosshair; a dashed ghost line for the comparison, an optional overlay
// (the money trail), and a scrubber. Pure SVG; animation comes from useTween.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Annotation, Bucket } from '../lib/api'
import { markersFor } from '../features/notes/markers'
import { fmtInt } from '../lib/format'
import { useTween } from '../lib/motion'
import { timeCopy } from './copy'
import { smooth } from './smooth'
import { bucketLabel, everyNth, peakIndex, threeScale } from './timeScale'
import { useCut } from './useCut'
import { NoteMarkers, TimeTip } from './chartParts'
import { PAD_L, PAD_T, AXIS_H, CHART_H, tipLeft } from './plot'
import { RevenueStrip, STRIP_H } from './RevenueStrip'
import { DaySeams, XLabels, YAxis } from './TimeGrid'
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
  // Revenue gets its own strip under the chart (its own scale, never a second axis).
  strip?: { values: number[]; fmt: (n: number) => string; label: string }
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
    /** inline rows ride on the revenue line instead of the row of figures. */
    rows?: { label: string; value: string; faint?: boolean; inline?: boolean }[]
  } | null
  /** Notes pinned to days: a launch, a post, an outage. */
  notes?: Annotation[]
  /** Adds a note to a day, from the + at the top of the crosshair. */
  onAddNote?: (day: string) => void
  /** Live pulse: things arriving right now, drawn rising from the last point. */
  pulses?: Pulse[]
  /** Replay tells a story: the line ends at the playhead, the rest unknown. */
  story?: boolean
  /** Replay is playing: no hover, touch or keys until it pauses or ends. */
  locked?: boolean
}

export type Pulse = { id: string; kind: 'visit' | 'goal' | 'sale'; label?: string }

export function TimeChart(p: TimeChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  const [picked, setHover] = useState<number | null>(null)
  // While Replay plays nothing is picked (and what was picked is let go of).
  if (p.locked && picked !== null) setHover(null)
  const hover = p.locked ? null : picked
  const [drag, setDrag] = useState(false)
  const STRIP = p.strip ? STRIP_H : 0
  const H = (p.height ?? CHART_H) + STRIP
  const plotH = H - PAD_T - AXIS_H - STRIP

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = p.values.length
  const target = useMemo(() => {
    const all = [...p.values, ...(p.ghost ?? []).slice(0, n), ...(p.overlay?.values ?? [])]
    return threeScale(Math.max(1, ...all))
  }, [p.values, p.ghost, p.overlay, n])
  const max = useTween(target.max)
  const vals = useTween(p.values)
  const ghost = useTween(p.ghost ? pad(p.ghost, n) : zeros(n))
  const over = useTween(p.overlay ? p.overlay.values : zeros(n))
  const strip = useTween(p.strip ? pad(p.strip.values, n) : zeros(n))
  // (The strip scales by the bars actually being drawn, not by where they are
  // heading: RevenueStrip takes the tweened values.)

  const plotW = w - PAD_L
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  // max is tweened, so on the very first frame it can still be 0 — and 0/0 is
  // a NaN in the middle of a path the browser then refuses to draw.
  const y = (v: number) => PAD_T + plotH - (v / (max || 1)) * plotH
  const line = (a: number[]) => smooth(a.map((v, i) => [x(i), y(v)]))
  const area = (a: number[]) => (a.length ? `${line(a)}L${x(a.length - 1).toFixed(1)} ${PAD_T + plotH}L${x(0).toFixed(1)} ${PAD_T + plotH}Z` : '')

  const ticks = [0, target.step, target.max]
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
  const { follow, release, onKey, marker, driven } = useCut({ ref, n, hover, scrub, locked: p.locked, vals, setHover, x, y })
  const leave = () => { release(); setHover(null); setDrag(false) }
  // Beside the point when there is room, never past either edge: on a phone
  // the card is nearly as wide as the chart, and it used to leave the screen.
  const tipW = w < 600 ? 188 : 204
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
        aria-label={timeCopy.chart(p.metric, n, fmtInt(Math.max(0, ...p.values)))}
        tabIndex={n ? 0 : -1}
        onKeyDown={p.locked ? undefined : onKey}
        onBlur={() => setHover(null)}
      >
        <defs>
          {/* The data is drawn inside the plot and nowhere else. The svg
              itself stays overflow: visible so an edge label or the hover
              dot is not cut in half — but a line or a bar can never paint
              over the cards above it, whatever a transition does. */}
          <clipPath id={gradId + '-plot'}>
            <rect x={PAD_L} y={0} width={Math.max(0, w - PAD_L)} height={H} />
          </clipPath>
          {/* Lit left of the cut, hidden right of it (a grey copy of the line
              shows through). Only the rect moves (a CSS transform), so the
              paths are never redrawn; it is invisible while merely hovering. */}
          <mask id={gradId + '-dim'} maskUnits="userSpaceOnUse" x={0} y={-PAD_T} width={w + 16} height={H + PAD_T}>
            <rect x={0} y={-PAD_T} width={w + 16} height={H + PAD_T} fill="#fff" />
            <rect className="chart-dim" x={0} y={-PAD_T} width={w + 16} height={H + PAD_T} fill="#000" />
          </mask>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.15" />
            <stop offset="0.85" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          {/* Revenue bars lit from the top, like the line above them. */}
          <linearGradient id={gradId + '-money'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--money)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--money)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <YAxis ticks={ticks} y={y} w={w} />
        <DaySeams labels={p.labels} bucket={p.bucket} x={x} bottom={PAD_T + plotH} />
        <line x1={PAD_L} x2={w} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="var(--border)" />
        {/* While Replay plays, is dragged or has a day picked, what is past the cut goes grey: this line shows through where the lit one is cut off. */}
        {dim && !p.story && <path d={line(vals)} fill="none" stroke="var(--text-4)" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" clipPath={`url(#${gradId}-plot)`} />}
        <g clipPath={`url(#${gradId}-plot)`}>
        <g mask={`url(#${gradId}-dim)`}>
        <g style={{ opacity: p.overlay ? 0.35 : 1, transition: 'opacity .25s' }}>
          <path d={area(vals)} fill={`url(#${gradId})`} />
          <path className="chart-line" d={line(p.partialLast && n > 2 ? vals.slice(0, -1) : vals)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {p.partialLast && n > 2 && (
            <path d={`M${x(n - 2).toFixed(1)} ${y(vals[n - 2]).toFixed(1)}L${x(n - 1).toFixed(1)} ${y(vals[n - 1]).toFixed(1)}`} fill="none" stroke="var(--accent)" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
          )}
        </g>
        {p.ghost && <path d={line(ghost)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />}
        {p.overlay && (
          <g>
            <path d={area(over)} fill={p.overlay.color} fillOpacity="0.22" />
            <path d={line(over)} fill="none" stroke={p.overlay.color} strokeWidth="2" strokeLinejoin="round" />
          </g>
        )}
        </g>
        </g>
        {/* Today, still counting: a point that pulses softly at the line's end, whole even on the plot's edge. */}
        {p.partialLast && n > 1 && hover == null && scrub == null && (
          <g className="chart-now" aria-hidden="true">
            <circle cx={x(n - 1)} cy={y(vals[n - 1] ?? 0)} r="4" fill="var(--accent)" className="chart-now-halo" />
            <circle cx={x(n - 1)} cy={y(vals[n - 1] ?? 0)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        {p.story && <g clipPath={`url(#${gradId}-plot)`}><rect className="chart-dim chart-unknown" x={0} y={PAD_T} width={w + 16} height={plotH} /></g>}
        {/* Replay's day: a solid line at the cut, drawn at the variable so it
            never lags the grey. The pointer's own cursor is CursorMark. */}
        {hover == null && <line className="chart-cut is-replay" x1={0} x2={0} y1={0} y2={PAD_T + plotH} />}
        {scrub != null && n > 1 && hover == null && (
          <circle ref={marker} cx={0} cy={0} transform={driven ? undefined : `translate(${x(scrub)} ${y(vals[scrub] ?? 0)})`} r={quiet ? 4 : 6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={quiet ? 2 : 3} />
        )}
        {hover != null && <CursorMark x={x(hover)} y={y(vals[hover] ?? 0)} top={PAD_T - 6} bottom={PAD_T + plotH} peak={hover === peak && !p.overlay ? timeCopy.peak : undefined} />}
        {p.strip && <RevenueStrip values={strip} label={p.strip.label} x={x} plotW={plotW} top={PAD_T + plotH} hover={hover} clip={gradId + '-plot'} mask={gradId + '-dim'} />}
        <XLabels labels={p.labels} bucket={p.bucket} every={labelEvery} x={x} y={H - 5} skip={hover != null ? x(hover) : null} />
      </svg>
      {/* Notes sit on the axis: a flag per day, its words on hover. */}
      <NoteMarkers markers={markers} x={x} top={PAD_T + plotH} width={w} />
      {hover != null && n > 0 && <TimeTip p={p} i={hover} left={tipAt} width={tipW} notes={markers.find((m) => m.i === hover)?.notes ?? []} />}
      {/* Add a note to the day under the cursor, without hunting for a
          button: it sits at the top of the crosshair, beside the tooltip,
          so moving up to it keeps the same day. */}
      {hover != null && n > 0 && p.onAddNote && (
        <button
          type="button"
          className="note-add"
          style={{ left: x(hover) }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            p.onAddNote?.(p.labels[hover].slice(0, 10))
          }}
          aria-label={timeCopy.addNoteOn(bucketLabel(p.labels[hover], p.bucket, true))}
          title={timeCopy.addNote}
        >
          +
        </button>
      )}
      {/* Live pulse: each visit rises from the last point as a dot, a goal as
          a ring, a sale as a coin with its amount. It is decoration on top of
          numbers that are already right, so it never waits for anything. */}
      {n > 0 &&
        (p.pulses ?? []).map((pl) => (
          <span key={pl.id} className={'pulse-' + pl.kind} style={{ left: x(n - 1), top: y(vals[n - 1] ?? 0) }} aria-hidden="true">
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
