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
  /** Right of the title: a live dot, a count. */
  aside?: ReactNode
  value: ReactNode
  pill?: { text: ReactNode; tone?: Tone; title?: string } | null
  sub?: ReactNode
  series?: number[] | null
  tone?: Tone
  /** Draws the area in this colour, whatever the tone. */
  color?: string
  compact?: boolean
  onOpen?: () => void
  openLabel?: string
  press?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  className?: string
}

export function MetricArea({ label, head, aside, value, pill, sub, series, tone = 'good', color, compact, onOpen, openLabel, press, onKeyDown, className = '' }: MetricAreaProps) {
  const pillEl = pill && (
    <Pill tone={pill.tone ?? tone} title={pill.title}>
      {pill.text}
    </Pill>
  )
  return (
    <Card title={head ?? label} aside={aside} onOpen={onOpen} openLabel={openLabel} press={press} onKeyDown={onKeyDown} className={`kit-metric ${compact ? 'compact' : ''} ${className}`}>
      <span className="kit-val">
        <b className="num">{value}</b>
        {pillEl}
      </span>
      {sub && <span className="kit-sub">{sub}</span>}
      {series && series.length > 1 && <Area values={series} color={color ?? toneColor(tone)} />}
    </Card>
  )
}
