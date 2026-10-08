// One key number, as light as a line of type: its name (small, dim), the
// number (mono, large) and its change under it as a small "54% ↑", coloured on
// the arrow and the number only. Nothing at all when there is nothing to
// compare with. The charted one is underlined, and a number that can be
// charted is a button.
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react'
import type { Delta } from '../../lib/format'
import { useCountUp } from '../../lib/motion'
import { KpiMark } from './kpiMark'
import { usePlayhead } from './playhead'
import { copy } from './copy'
import './Overview.css'

interface Props {
  label: string
  value?: number
  /** While Replay plays: the number at the playhead's position, between two points. */
  live?: (pos: number) => number
  /** Replay has not reached a first visit: a dash, not 0, 0% or 0s. */
  blank?: (pos: number) => boolean
  fmt: (n: number) => string
  d: Delta | null
  /** The comparison in words, as the period picker says it. */
  vs: string
  pressed?: boolean
  onClick?: () => void
  money?: boolean
  loading?: boolean
  /** A small chip after the change, on its line (vs usual, the month's pace): only where the change itself is shown. */
  hint?: ReactNode
  /** The month's pace, quiet after the change (or on a line of its own when there is no change): the Visitors tile's. */
  pace?: ReactNode
  /** What the number is, in a tooltip that opens on hover, focus or a tap (Visitors adds what it leaves out: the bots filtered). */
  tip?: string
  /** Which mark stands before the name (KpiMarks). */
  icon?: ComponentProps<typeof KpiMark>['k']
}

/** After its first count-up a number changes in a blink: switching period or number is instant. */
const SETTLE_MS = 120

export function KpiTile(p: Props) {
  // While it plays the number follows the playhead itself, frame by frame,
  // with no tween of its own to restart at every point.
  const pos = usePlayhead(!!p.live)
  const tweened = useCountUp(p.value, p.live ? 0 : SETTLE_MS).v
  const v = p.live ? p.live(pos) : tweened
  const none = !!p.blank?.(pos)
  const cls = 'kpi' + (p.money ? ' money' : '')
  const [open, setOpen] = useState(false)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => !(e.target as Element | null)?.closest?.('.kpi.tipping') && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const words = p.tip ? tipLines(p.tip, p.d, p.vs) : ''
  const name = (
    <>
      {p.icon && <KpiMark k={p.icon} />}
      {p.label}
    </>
  )
  const body = (
    <>
      {/* A tile that is not a button gets its tooltip from its name: a real button, so a tap or Enter opens it. */}
      <span className="label kpi-name">
        {p.onClick || !p.tip ? name : (
          <button type="button" className="tip-text" aria-describedby={open ? id : undefined} onClick={() => setOpen(true)}>
            {name}
          </button>
        )}
      </span>
      {/* The skeleton is decorative: the loading bar at the top of the page
          is the one thing that announces loading, and it says it once. */}
      {p.loading ? <span className="value skeleton" aria-hidden="true" /> : <span className="value num">{p.value === undefined || none ? '–' : p.fmt(v)}</span>}
      {p.d && !p.loading && !none && <Change d={p.d} vs={p.vs} hint={p.hint} pace={p.pace} />}
      {!p.d && !p.loading && !none && p.pace && <span className="kpi-pace-row">{p.pace}</span>}
      {/* The change's line is kept while loading, and while a dash stands for nothing yet: the strip is as tall as it will be. */}
      {(p.loading || (none && p.d)) && <span className="kpi-delta" aria-hidden="true" />}
    </>
  )
  const tip = open && words ? (
    <span className="tip kpi-tip" id={id} role="tooltip">
      {words}
    </span>
  ) : null
  if (!p.onClick)
    return (
      <div className={cls + (p.tip ? ' tipping' : '')} onMouseEnter={() => setOpen(!!p.tip)} onMouseLeave={() => setOpen(false)}>
        {body}
        {tip}
      </div>
    )
  return (
    <button
      type="button"
      className={cls + (p.tip ? ' tipping' : '')}
      aria-pressed={p.pressed}
      aria-describedby={open ? id : undefined}
      onClick={() => {
        setOpen(true)
        p.onClick?.()
      }}
      onMouseEnter={() => setOpen(!!p.tip)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(!!p.tip)}
      onBlur={() => setOpen(false)}
      title={p.tip ? undefined : copy.chartTile(p.label)}
    >
      {body}
      {tip}
    </button>
  )
}

/** What the tooltip says: the definition, and for a number where lower is better, which way the move went. */
const tipLines = (tip: string, d: Delta | null, vs: string) => (d?.verdict ? `${tip} ${copy.moved(d.label, vs, d.verdict === 'worse' ? copy.worse : copy.better)}` : tip)

function Change({ d, vs, hint, pace }: { d: Delta; vs: string; hint?: ReactNode; pace?: ReactNode }) {
  const label = copy.change(d.label, vs)
  return (
    <span className={`kpi-delta num tone-${d.tone}`} title={label}>
      <span aria-hidden="true">{d.short}</span>
      <span className="sr">{label}</span>
      {hint}
      {pace}
    </span>
  )
}
