// A big number, its pill, a line of context and a soft area chart to the
// card's edge. Green when the move is good, red when bad, or the site's own
// colour (`color`). With `compact` the number and pill share a row (a site card).
import type { KeyboardEventHandler, ReactNode } from 'react'
import { Area } from './Area'
import { Card } from './Card'
import { Pill } from './Pill'
import { toneColor, type Tone } from './model'

export type MetricAreaProps = {
  label?: ReactNode
  /** In place of the plain label: a site's mark and name. */
  head?: ReactNode
  /** In the tile before the title. */
  icon?: ReactNode
  /** The icon tile's colour: the one place a state shows. */
  iconTone?: 'good' | 'warn' | 'bad'
  /** A quiet word on the right of the top line. */
  status?: ReactNode
  /** Right of the title: a live dot, a count. */
  aside?: ReactNode
  value: ReactNode
  pill?: { text: ReactNode; tone?: Tone; title?: string } | null
  sub?: ReactNode
  series?: number[] | null
  /** A second dashed line on the same scale, and how many points wide the chart is. */
  was?: number[]
  slots?: number
  tone?: Tone
  /** Draws the area in this colour, whatever the tone. */
  color?: string
  compact?: boolean
  onOpen?: () => void
  openLabel?: string
  stretch?: boolean
  variant?: 'plain'
  press?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  className?: string
}

export function MetricArea({ icon, iconTone, status, label, head, aside, value, pill, sub, series, was, slots, tone = 'good', color, compact, onOpen, openLabel, stretch, variant, press, onKeyDown, className = '' }: MetricAreaProps) {
  const pillEl = pill && (
    <Pill tone={pill.tone ?? tone} title={pill.title}>
      {pill.text}
    </Pill>
  )
  return (
    <Card icon={icon} tone={iconTone} status={status} chart={series && series.length > 1 ? <Area values={series} was={was} slots={slots} color={color ?? toneColor(tone)} /> : undefined} title={head ?? label} aside={aside} onOpen={onOpen} openLabel={openLabel} stretch={stretch} variant={variant} press={press} onKeyDown={onKeyDown} className={`kit-metric ${compact ? 'compact' : ''} ${className}`}>
      <span className="kit-val">
        <b className="num">{value}</b>
        {pillEl}
      </span>
      {sub && <span className="kit-sub">{sub}</span>}
    </Card>
  )
}
