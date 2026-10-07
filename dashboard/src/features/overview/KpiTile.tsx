// One key number, as light as a line of type: its name (small, dim), the
// number (mono, large) and its change under it as a small "54% ↑", coloured on
// the arrow and the number only. Nothing at all when there is nothing to
// compare with. The charted one is underlined, and a number that can be
// charted is a button.
import type { ComponentProps, ReactNode } from 'react'
import type { Delta } from '../../lib/format'
import { useTween } from '../../lib/motion'
import { Area } from '../../kit/Area'
import { Card } from '../../kit/Card'
import { toneColor, type Tone } from '../../kit/model'
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
  /** A line more for the tile's tooltip: what the number leaves out (Visitors: the bots filtered). */
  tip?: string
  /** Which mark stands before the name (KpiMarks). */
  icon?: ComponentProps<typeof KpiMark>['k']
  /** The chart slot: the number's days, drawn as a soft line to the card's bottom edge. */
  series?: number[]
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
  const shown = !p.loading && !none
  const tone = toneOfDelta(p.d)
  const drawn = p.series && p.series.length > 1 && !p.loading
  const props = {
    className: cls,
    icon: p.icon ? <KpiMark k={p.icon} /> : undefined,
    title: (
      <span className="label kpi-name" title={tipped(p.label, p.tip)}>
        {p.label}
      </span>
    ),
    chart: drawn ? <Area values={p.series as number[]} color={p.money ? 'var(--money)' : toneColor(tone)} /> : undefined,
  }
  const body = (
    <>
      <span className="kit-val">
        {/* The skeleton is decorative: the loading bar at the top of the page
            is the one thing that announces loading, and it says it once. */}
        {p.loading ? <span className="value skeleton" aria-hidden="true" /> : <b className="value num">{p.value === undefined || none ? '–' : p.fmt(v)}</b>}
        {p.d && shown && <Change d={p.d} vs={p.vs} />}
      </span>
      {shown && (p.hint || p.pace) && (
        <span className="kit-sub kpi-sub">
          {p.hint}
          {p.pace}
        </span>
      )}
      {/* The change's line is kept while loading, and while a dash stands for nothing yet: the strip is as tall as it will be. */}
      {(p.loading || (none && p.d)) && <span className="kpi-delta" aria-hidden="true" />}
    </>
  )
  if (!p.onClick)
    return (
      <Card {...props}>
        {body}
      </Card>
    )
  return (
    <Card {...props} press={p.onClick} pressed={!!p.pressed} tooltip={tipped(copy.chartTile(p.label), p.tip)}>
      {body}
    </Card>
  )
}

const TONE: Record<Delta['tone'], Tone> = { up: 'good', down: 'bad', flat: 'neutral' }
const toneOfDelta = (d: Delta | null): Tone => (d ? TONE[d.tone] : 'neutral')

/** A tooltip with its extra line under it, when there is one. */
const tipped = (title: string, tip?: string) => (tip ? `${title}\n${tip}` : title)

function Change({ d, vs }: { d: Delta; vs: string }) {
  const label = copy.change(d.label, vs)
  const tone = toneOfDelta(d)
  return (
    <span className={`kpi-delta kit-pill num ${tone}`} title={label}>
      <span aria-hidden="true">{d.short}</span>
      <span className="sr">{label}</span>
    </span>
  )
}
