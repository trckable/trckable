// A pin as a card: what it is (an icon with its own colour), when, the figure
// counting up with where it came from beside it, a small chart of the moment, and
// the actions. Both the card on opening (a deck of up to three) and the card a
// marker opens are this. The figure and its words are figure.ts's; the chart's
// numbers are pinChart.ts's.
import { useEffect, useState, type ReactNode } from 'react'
import { Chart } from '../../components/SideCard/Chart'
import { SideCard, type SideCardProps } from '../../components/SideCard/SideCard'
import type { Point } from '../../lib/api'
import { todayIn } from '../../lib/dates'
import { ownDays } from './api'
import { figureOf, whenOf } from './figure'
import { chipsOf, hasGhost, kindOf } from './kinds'
import { pinChart, type Own } from './pinChart'
import type { Pin } from './pins'
import { Rolling } from './Rolling'
import { SourceChip } from './SourceChip'
import { say } from './words'

/** The kinds whose figure does not say it all: the page, the change, the average. */
const FACTS = ['drop', 'move', 'pays', 'ai']

export interface PinCardProps extends Pick<SideCardProps, 'id' | 'asked' | 'onClose' | 'actions' | 'deck'> {
  pin: Pin
  site: { id: string; timezone: string }
  series: readonly Point[]
  money: (minor: number) => string
  closeLabel: string
  /** The card's name for assistive tech: the kind's, unless the card has its own. */
  label?: string
  /** More under the figure (the markers that landed together). */
  extra?: ReactNode
}

/** The pages and sources whose own days make their chart: asked for once the card is up. */
export function useOwn(pin: Pin, site: { id: string; timezone: string }): Own | undefined {
  const [got, setGot] = useState<{ id: string; own: Own } | null>(null)
  const f = pin.filters[0]
  const wants = (pin.kind === 'referrer' || pin.kind === 'move') && f
  useEffect(() => {
    if (!wants) return
    let live = true
    void ownDays(site.id, site.timezone, f.dim, f.value)
      .then((own) => live && setGot({ id: pin.id, own }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pin.id, site.id, site.timezone]) // eslint-disable-line react-hooks/exhaustive-deps -- the pin's id says which source
  return got?.id === pin.id ? got.own : undefined
}

export function PinCard({ pin, site, series, money, closeLabel, label, extra, ...card }: PinCardProps) {
  const said = say(pin, money)
  const fig = figureOf(pin, money)
  const own = useOwn(pin, site)
  const spec = pinChart(pin, series, own)
  const chips = chipsOf(pin)
  // What a chip already says is not said again in the notes.
  const notes = FACTS.includes(pin.kind) ? said.facts.filter((f) => !chips.some((c) => Object.values(c)[0] === f)) : []
  return (
    <SideCard
      {...card}
      label={label ?? said.title}
      closeLabel={closeLabel}
      kind={kindOf(pin)}
      when={whenOf(pin, todayIn(site.timezone))}
      ghost={hasGhost(pin)}
      title={
        <span key={pin.id} className="side-num num">
          {fig.n !== undefined && fig.fmt ? <Rolling to={fig.n} fmt={fig.fmt} /> : fig.text}
          {fig.unit && <small>{fig.unit}</small>}
        </span>
      }
      chart={spec ? <Chart key={pin.id} spec={spec} /> : undefined}
    >
      {(fig.mult || chips.length > 0) && (
        <div className="side-sub">
          {fig.mult && <span className="side-mult num">{fig.mult}</span>}
          {chips.map((c, i) => (
            <SourceChip key={i} chip={c} />
          ))}
        </div>
      )}
      {notes.length > 0 && <p className="side-facts muted">{notes.join(' · ')}</p>}
      {extra}
    </SideCard>
  )
}
