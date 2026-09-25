// The main chart: one y-axis, an area for the current period, a dashed ghost
// line for the comparison, an optional overlay (the money trail), and a
// scrubber. Pure SVG; animation comes from useTween.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bucket } from '../lib/api'
import { fmtCompact, fmtInt } from '../lib/format'
import { useTween } from '../lib/motion'

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
   * Extra lines for the hovered bucket: a split bar (new vs returning) and any
   * number of name/value rows. The chart knows how to draw them; the dashboard
   * knows what they mean.
   */
  detail?: (i: number) => {
    /** Split bars: how the bucket divides. tone colours the filled part, fmt writes the numbers. */
    splits?: { a: number; b: number; aLabel: string; bLabel: string; tone?: string; fmt?: (v: number) => string }[]
    rows?: { label: string; value: string; faint?: boolean }[]
  } | null
  /** Notes pinned to a bucket: a launch, a post, an outage. */
  notes?: { at: string; text: string }[]
  /** Adds a note to a day, from the + at the top of the crosshair. */
  onAddNote?: (day: string) => void
  /** Live pulse: things arriving right now, drawn rising from the last point. */
  pulses?: Pulse[]
}

export type Pulse = { id: string; kind: 'visit' | 'goal' | 'sale'; label?: string }

const PAD_L = 44
const PAD_T = 8
const AXIS_H = 26

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function bucketLabel(t: string, bucket: Bucket, long = false): string {
  if (!t) return ''
  const d = new Date(t + ':00Z')
  const md = `${months[d.getUTCMonth()]} ${d.getUTCDate()}`
  switch (bucket) {
    case 'hour':
      return long ? `${days[d.getUTCDay()]}, ${md} · ${t.slice(11, 16)}` : t.slice(11, 16)
    case 'day':
      return long ? `${days[d.getUTCDay()]}, ${md}` : md
    case 'week':
      return long ? `Week of ${md}, ${d.getUTCFullYear()}` : md
    case 'month':
      return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  }
}

/** A tight, round axis: step from 1/2/2.5/5 × 10^k with at most 5 gridlines. */
function niceScale(v: number): { max: number; step: number } {
  v = Math.max(4, v * 1.04)
  const pow = Math.pow(10, Math.floor(Math.log10(v / 4)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * pow
    const n = Math.ceil(v / step)
    if (n <= 5) return { max: n * step, step }
  }
  return { max: v, step: v / 4 }
}

export function TimeChart(p: TimeChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)
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
    return niceScale(Math.max(1, ...all))
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

  const ticks = Array.from({ length: Math.round(target.max / target.step) }, (_, j) => (j + 1) * target.step)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90))))

  const indexAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const rel = clientX - r.left - PAD_L
    return Math.max(0, Math.min(n - 1, Math.round((rel / plotW) * (n - 1))))
  }

  const scrub = p.scrub ?? null
  const detail = hover != null ? (p.detail?.(hover) ?? null) : null
  const hi = hover ?? scrub
  // Beside the point when there is room, never past either edge: on a phone
  // the card is nearly as wide as the chart, and it used to leave the screen.
  const tipW = 244
  const tipLeft = hi != null ? Math.max(0, Math.min(w - tipW, x(hi) > w - 270 ? x(hi) - 258 : x(hi) + 14)) : 0
  const gradId = 'g-area'

  return (
    <div
      ref={ref}
      className="chart-wrap"
      style={{ height: H }}
      onPointerMove={(e) => {
        if (!n) return
        const i = indexAt(e.clientX)
        if (dragging.current && p.onScrub) p.onScrub(i)
        else setHover(i)
      }}
      onPointerLeave={() => {
        setHover(null)
        dragging.current = false
      }}
      onPointerDown={(e) => {
        if (!p.onScrub || !n) return
        dragging.current = true
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        p.onScrub(indexAt(e.clientX))
      }}
      onPointerUp={() => (dragging.current = false)}
      role="img"
      aria-label={`${p.metric} over time: ${n} points, peak ${fmtInt(Math.max(0, ...p.values))}`}
    >
      <svg width={w} height={H} aria-hidden="true">
        <defs>
          {/* The data is drawn inside the plot and nowhere else. The svg
              itself stays overflow: visible so an edge label or the hover
              dot is not cut in half — but a line or a bar can never paint
              over the cards above it, whatever a transition does. */}
          <clipPath id={gradId + '-plot'}>
            <rect x={PAD_L} y={0} width={Math.max(0, w - PAD_L)} height={H} />
          </clipPath>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.08" />
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
            <line x1={PAD_L} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={0} y={y(t) + 4} className="num" fontSize="11" fill="var(--text-3)">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        <line x1={PAD_L} x2={w} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="var(--border)" />
        <g clipPath={`url(#${gradId}-plot)`}>
        <g style={{ opacity: p.overlay ? 0.35 : 1, transition: 'opacity .25s' }}>
          <path d={area(vals)} fill={`url(#${gradId})`} />
          <path className="chart-line" d={line(p.partialLast && n > 2 ? vals.slice(0, -1) : vals)} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
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
        {scrub != null && n > 1 && (
          <g>
            <rect x={x(scrub)} y={0} width={Math.max(0, w - x(scrub))} height={PAD_T + plotH} fill="var(--surface)" fillOpacity="0.7" />
            <line x1={x(scrub)} x2={x(scrub)} y1={0} y2={PAD_T + plotH} stroke="var(--text)" strokeWidth="1.5" />
            <circle cx={x(scrub)} cy={y(vals[scrub] ?? 0)} r="6" fill="var(--accent)" stroke="var(--surface)" strokeWidth="3" />
          </g>
        )}
        {hover != null && hover !== scrub && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={PAD_T + plotH} stroke="var(--text-2)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(vals[hover] ?? 0)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        {p.strip && (
          <g aria-hidden="true">
            <text x={0} y={PAD_T + plotH + 30} fontSize="11" fill="var(--text-3)">
              {p.strip.label}
            </text>
            <g clipPath={`url(#${gradId}-plot)`}>
            {strip.map((v, i) => {
              const bw = Math.max(1.5, Math.min(18, (plotW / Math.max(1, n)) * 0.62))
              const bh = v > 0 ? Math.min(STRIP - 16, Math.max(2, (v / stripMax) * (STRIP - 16))) : 0
              const base = PAD_T + plotH + STRIP - 4
              const dim = (hi != null && hi !== i) || (scrub != null && i > scrub)
              return <rect key={i} x={x(i) - bw / 2} y={base - bh} width={bw} height={bh} rx={Math.min(3, bw / 2)} fill={`url(#${gradId}-money)`} opacity={dim ? 0.35 : 1} />
            })}
            </g>
          </g>
        )}
        {p.labels.map((t, i) =>
          i % labelEvery === 0 ? (
            <text key={t} x={x(i)} y={H - 6} fontSize="11" fill="var(--text-3)" textAnchor={i === 0 ? 'start' : 'middle'} className="num">
              {bucketLabel(t, p.bucket)}
            </text>
          ) : null,
        )}
      </svg>
      {/* Notes sit on the axis: a flag you can read without leaving the chart. */}
      {(p.notes ?? []).map((note) => {
        const i = p.labels.findIndex((l) => l.slice(0, 10) === note.at)
        if (i < 0) return null
        return (
          <span key={note.at + note.text} className="note-flag" style={{ left: x(i) }} title={note.text}>
            <i />
            <em>{note.text}</em>
          </span>
        )
      })}
      {hover != null && n > 0 && (
        <div className="chart-tip time-tip" style={{ left: tipLeft }}>
          <div className="ct-head">
            <b>{bucketLabel(p.labels[hover], p.bucket, true)}</b>
            {p.partialLast && hover === n - 1 && <span className="ct-live">In progress</span>}
          </div>
          {/* The flag on the axis is a short tag; the whole note is here,
              where there is room to read it. */}
          {(p.notes ?? [])
            .filter((note) => note.at === p.labels[hover].slice(0, 10))
            .map((note) => (
              <div className="tip-note" key={note.text}>
                {note.text}
              </div>
            ))}
          <div className="ct-hero">
            <span className="ct-label">
              <i style={{ background: 'var(--accent)' }} />
              {p.metric}
            </span>
            <span className="ct-big num">{fmtInt(p.values[hover] ?? 0)}</span>
            {p.ghost && p.ghost[hover] !== undefined && (
              <span className="ct-vs num">
                {(() => {
                  const a = p.values[hover] ?? 0
                  const b = p.ghost[hover] ?? 0
                  const pct = b ? Math.round(((a - b) / b) * 100) : null
                  return (
                    <>
                      {pct !== null && <em className={pct >= 0 ? 'tone-up' : 'tone-down'}>{(pct >= 0 ? '↑ ' : '↓ ') + Math.abs(pct) + '%'}</em>} vs {fmtInt(b)}
                      {p.ghostLabels?.[hover] ? ` on ${bucketLabel(p.ghostLabels[hover], p.bucket, true)}` : ''}
                    </>
                  )
                })()}
              </span>
            )}
          </div>
          {p.strip && (
            <div className="ct-hero money">
              <span className="ct-label">
                <i style={{ background: 'var(--money)' }} />
                {p.strip.label}
              </span>
              <span className="ct-big num">{p.strip.fmt(p.strip.values[hover] ?? 0)}</span>
            </div>
          )}
          {p.overlay && (
            <div className="ct-row">
              <span>
                <i style={{ background: p.overlay.color }} />
                {p.overlay.name}
              </span>
              <span className="num">{fmtInt(p.overlay.values[hover] ?? 0)}</span>
            </div>
          )}
          {detail?.splits?.map((sp) => {
            const write = sp.fmt ?? fmtInt
            return (
              <div className="ct-split" key={sp.aLabel + sp.bLabel} aria-hidden="true">
                <span className="ct-split-bar">
                  <span style={{ width: `${(sp.a / Math.max(1, sp.a + sp.b)) * 100}%`, background: sp.tone ?? 'var(--accent)' }} />
                </span>
                <em>
                  <span className="num">{write(sp.a)}</span> {sp.aLabel}
                </em>
                <em className="right">
                  <span className="num">{write(sp.b)}</span> {sp.bLabel}
                </em>
              </div>
            )
          })}
          {detail?.rows && detail.rows.length > 0 && (
            <div className="ct-grid">
              {detail.rows.map((r) => (
                <span key={r.label}>
                  <em>{r.label}</em>
                  <b className="num">{r.value}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
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
            p.onAddNote!(p.labels[hover].slice(0, 10))
          }}
          aria-label={`Add a note on ${bucketLabel(p.labels[hover], p.bucket, true)}`}
          title="Add a note on this day"
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
      {/* How long ago that bucket was, pinned under the axis at the cursor. */}
      {hover != null && n > 0 && ago(p.labels[hover]) && (
        <span className="ago-pill" style={{ left: Math.max(30, Math.min(x(hover), w - 30)) }}>
          {ago(p.labels[hover])}
        </span>
      )}
    </div>
  )
}

/** "today", "yesterday", "12 days ago" — the same words people use. */
function ago(t: string): string {
  if (!t) return ''
  const then = new Date(t + ':00Z').getTime()
  const days = Math.round((Date.now() - then) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 45) return `${days} days ago`
  const months = Math.round(days / 30)
  return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`
}

const zeros = (n: number) => Array(n).fill(0)
const pad = (a: number[], n: number) => (a.length >= n ? a.slice(0, n) : [...a, ...zeros(n - a.length)])

/** A curve through every point that never overshoots them (monotone cubic,
 *  Fritsch–Carlson): a quiet day between two busy ones dips, it does not
 *  swing below zero, and a peak is drawn where it happened, no higher. */
function smooth(pts: number[][]): string {
  const n = pts.length
  if (n === 0) return ''
  const P = (i: number) => pts[i]!
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px!.toFixed(1)} ${py!.toFixed(1)}`).join('')
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((P(i + 1)[1]! - P(i)[1]!) / (P(i + 1)[0]! - P(i)[0]! || 1))
  const m: number[] = [d[0]!]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2)
  m.push(d[n - 2]!)
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0
      continue
    }
    const a = m[i]! / d[i]!
    const b = m[i + 1]! / d[i]!
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      m[i] = t * a * d[i]!
      m[i + 1] = t * b * d[i]!
    }
  }
  let out = `M${P(0)[0]!.toFixed(1)} ${P(0)[1]!.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P(i) as [number, number]
    const [x1, y1] = P(i + 1) as [number, number]
    const h = (x1 - x0) / 3
    out += `C${(x0 + h).toFixed(1)} ${(y0 + m[i]! * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - m[i + 1]! * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return out
}
