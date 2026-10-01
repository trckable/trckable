// One key number, as light as a line of type: its name (small, dim), the
// number (mono, large) and its change under it as a small "54% ↑", coloured on
// the arrow and the number only. Nothing at all when there is nothing to
// compare with. The charted one is underlined, and a number that can be
// charted is a button.
import type { ComponentProps } from 'react'
import type { Delta } from '../../lib/format'
import { useTween } from '../../lib/motion'
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
  /** Which mark stands before the name (KpiMarks). */
  icon?: Exclude<ComponentProps<typeof KpiMark>['k'], 'pay'>
}

/** A number changes in a blink, not a count-up: switching period or number is instant. */
const SETTLE_MS = 120

export function KpiTile(p: Props) {
  // While it plays the number follows the playhead itself, frame by frame,
  // with no tween of its own to restart at every point.
  const pos = usePlayhead(!!p.live)
  const tweened = useTween(p.value ?? 0, p.live ? 0 : SETTLE_MS)
  const v = p.live ? p.live(pos) : tweened
  const none = !!p.blank?.(pos)
  const cls = 'kpi' + (p.money ? ' money' : '')
  const body = (
    <>
      <span className="label kpi-name" title={p.label}>
        {p.icon && <KpiMark k={p.icon} />}
        {p.label}
      </span>
      {/* The skeleton is decorative: the loading bar at the top of the page
          is the one thing that announces loading, and it says it once. */}
      {p.loading ? <span className="value skeleton" aria-hidden="true" /> : <span className="value num">{p.value === undefined || none ? '–' : p.fmt(v)}</span>}
      {p.d && !p.loading && !none && <Change d={p.d} vs={p.vs} />}
      {/* The change's line is kept while loading, and while a dash stands for nothing yet: the strip is as tall as it will be. */}
      {(p.loading || (none && p.d)) && <span className="kpi-delta" aria-hidden="true" />}
    </>
  )
  if (!p.onClick) return <div className={cls}>{body}</div>
  return (
    <button type="button" className={cls} aria-pressed={p.pressed} onClick={p.onClick} title={copy.chartTile(p.label)}>
      {body}
    </button>
  )
}

function Change({ d, vs }: { d: Delta; vs: string }) {
  const label = copy.change(d.label, vs)
  return (
    <span className={`kpi-delta num tone-${d.tone}`} title={label}>
      <span aria-hidden="true">{d.short}</span>
      <span className="sr">{label}</span>
    </span>
  )
}
