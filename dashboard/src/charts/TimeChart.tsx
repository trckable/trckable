// The main chart, drawn like Live's: one glowing line over a soft fill, three
// y labels (0, half, top) and one label on the peak; a dashed ghost line for
// the comparison, an optional overlay (the money trail), and a scrubber.
// Pure SVG; animation comes from useTween.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Annotation, Bucket } from '../lib/api'
import { markersFor } from '../features/notes/markers'
import { fmtCompact, fmtInt } from '../lib/format'
import { useTween } from '../lib/motion'
import { timeCopy } from './copy'
import { smooth } from './smooth'
import { bucketLabel, everyNth, peakIndex, threeScale } from './timeScale'
import { useCut } from './useCut'
import { NoteMarkers, TimeTip } from './chartParts'
import { anchorAt, PeakLabel } from './PeakLabel'
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
    rows?: { label: string; value: string; faint?: boolean }[]
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

const PAD_L = 44
const PAD_T = 8
const AXIS_H = 26

export function TimeChart(p: TimeChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  const [picked, setHover] = useState<number | null>(null)
  // While Replay plays nothing is picked (and what was picked is let go of).
  if (p.locked && picked !== null) setHover(null)
  const hover = p.locked ? null : picked
  const [drag, setDrag] = useState(false)
  const STRIP = p.strip ? 64 : 0
  const H = (p.height ?? 220) + STRIP
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
  // Scaled by the bars actually being drawn, not by where they are heading:
  // mid-tween the old period's tall bars would otherwise be divided by the
  // new period's small maximum and shoot out of the strip.
  const stripMax = Math.max(1, ...strip)

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
  const { follow, release, onKey, marker, driven } = useCut({ ref, n, hover, scrub, locked: p.locked, vals, setHover, x, y })
  const leave = () => { release(); setHover(null); setDrag(false) }
  // Beside the point when there is room, never past either edge: on a phone
  // the card is nearly as wide as the chart, and it used to leave the screen.
  const tipW = 244
  const tipLeft = hover != null ? Math.max(0, Math.min(w - tipW, x(hover) > w - 270 ? x(hover) - 258 : x(hover) + 14)) : 0
  const gradId = 'g-area'

  return (
    <div
      ref={ref}
      className="chart-wrap"
      data-story={p.story || undefined}
      data-locked={p.locked || undefined} data-quiet={quiet || undefined}
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
          {/* Lit left of the cut, greyed right of it. Only the grey rect
              moves (a CSS transform), so the paths are never redrawn. */}
          <mask id={gradId + '-dim'} maskUnits="userSpaceOnUse" x={0} y={-PAD_T} width={w + 16} height={H + PAD_T}>
            <rect x={0} y={-PAD_T} width={w + 16} height={H + PAD_T} fill="#fff" />
            <rect className="chart-dim" x={0} y={-PAD_T} width={w + 16} height={H + PAD_T} fill={p.story ? '#000' : '#474747'} />
          </mask>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.26" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          {/* Revenue bars lit from the top, like the line above them. */}
          <linearGradient id={gradId + '-money'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--money)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--money)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            {t > 0 && <line x1={PAD_L} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray="2 4" />}
            <text x={0} y={y(t) + 4} className="num" fontSize="11" fill="var(--text-3)">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={w} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="var(--border)" />
        <g clipPath={`url(#${gradId}-plot)`}>
        <g mask={`url(#${gradId}-dim)`}>
        <g style={{ opacity: p.overlay ? 0.35 : 1, transition: 'opacity .25s' }}>
          <path d={area(vals)} fill={`url(#${gradId})`} />
          <path className="chart-line" d={line(p.partialLast && n > 2 ? vals.slice(0, -1) : vals)} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {p.partialLast && n > 2 && (
            <path d={`M${x(n - 2).toFixed(1)} ${y(vals[n - 2]).toFixed(1)}L${x(n - 1).toFixed(1)} ${y(vals[n - 1]).toFixed(1)}`} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
          )}
        </g>
        {p.ghost && <path d={line(ghost)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />}
        {/* Today, still counting: a point that breathes at the line's end. */}
        {p.partialLast && n > 1 && hover == null && scrub == null && (
          <g className="chart-now" aria-hidden="true">
            <circle cx={x(n - 1)} cy={y(vals[n - 1] ?? 0)} r="9" fill="var(--accent)" className="chart-now-halo" />
            <circle cx={x(n - 1)} cy={y(vals[n - 1] ?? 0)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        {p.overlay && (
          <g>
            <path d={area(over)} fill={p.overlay.color} fillOpacity="0.22" />
            <path d={line(over)} fill="none" stroke={p.overlay.color} strokeWidth="2" strokeLinejoin="round" />
          </g>
        )}
        </g>
        </g>
        {p.story && <g clipPath={`url(#${gradId}-plot)`}><rect className="chart-dim chart-unknown" x={0} y={PAD_T} width={w + 16} height={plotH} /></g>}
        {/* Replay's day: a solid line at the cut, drawn at the variable so it
            never lags the grey. The pointer's own cursor is CursorMark. */}
        {hover == null && <line className="chart-cut is-replay" x1={0} x2={0} y1={0} y2={PAD_T + plotH} />}
        {scrub != null && n > 1 && hover == null && (
          <circle ref={marker} cx={0} cy={0} transform={driven ? undefined : `translate(${x(scrub)} ${y(vals[scrub] ?? 0)})`} r={quiet ? 4 : 6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={quiet ? 2 : 3} />
        )}
        {hover != null && <CursorMark x={x(hover)} y={y(vals[hover] ?? 0)} top={0} bottom={PAD_T + plotH} />}
        {peak >= 0 && hover == null && scrub == null && !p.overlay && <PeakLabel x={x(peak)} y={y(vals[peak] ?? 0)} w={w} text={timeCopy.peak(fmtInt(p.values[peak]), bucketLabel(p.labels[peak], p.bucket))} padL={PAD_L} />}
        {p.strip && (
          <g aria-hidden="true">
            <text x={0} y={PAD_T + plotH + 30} fontSize="11" fill="var(--text-3)">
              {p.strip.label}
            </text>
            <g clipPath={`url(#${gradId}-plot)`}>
            <g mask={`url(#${gradId}-dim)`}>
            {strip.map((v, i) => {
              const bw = Math.max(1.5, Math.min(18, (plotW / Math.max(1, n)) * 0.62))
              const bh = v > 0 ? Math.min(STRIP - 16, Math.max(2, (v / stripMax) * (STRIP - 16))) : 0
              const base = PAD_T + plotH + STRIP - 4
              return <rect key={i} x={x(i) - bw / 2} y={base - bh} width={bw} height={bh} rx={Math.min(3, bw / 2)} fill={`url(#${gradId}-money)`} />
            })}
            </g>
            </g>
          </g>
        )}
        {p.labels.map((t, i) =>
          i % labelEvery === 0 ? (
            <text key={t} x={x(i)} y={H - 6} fontSize="11" fill="var(--text-3)" textAnchor={anchorAt(i, n)} className="num">
              {bucketLabel(t, p.bucket)}
            </text>
          ) : null,
        )}
      </svg>
      {/* Notes sit on the axis: a flag per day, its words on hover. */}
      <NoteMarkers markers={markers} x={x} top={PAD_T + plotH} width={w} />
      {hover != null && n > 0 && <TimeTip p={p} i={hover} left={tipLeft} notes={markers.find((m) => m.i === hover)?.notes ?? []} />}
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
