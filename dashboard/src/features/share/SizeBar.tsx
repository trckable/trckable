// Over the picture: the periods (for a card that has a span of time), then the sizes the place offers, the picture taking the one picked.
// A custom period opens its two days under them.
import type { ISODate } from '../../lib/dates'
import { PERIODS, formatOf, hasPeriod, type CardId, type Look } from './card'
import { copy } from './copy'
import { PeriodRange } from './PeriodRange'
import { placeOf, type Place } from './places'

type Props = {
  place: Place
  size: number
  card: CardId
  look: Pick<Look, 'period' | 'from' | 'to'>
  today: ISODate
  /** The site's first day with data: the earliest a custom period may start. */
  first?: string
  onSize: (i: number) => void
  onPeriod: (p: Look['period']) => void
  onRange: (from: string, to: string) => void
}

export function SizeBar({ place, size, card, look, today, first, onSize, onPeriod, onRange }: Props) {
  const sizes = placeOf(place).sizes
  const spanned = hasPeriod(card)
  return (
    <>
      <div className="sd-chips">
        {spanned && (
          <>
            <div className="sd-chips-set" role="group" aria-label={copy.period}>
              {PERIODS.map((p) => (
                <button key={p} type="button" className="sd-chip" aria-pressed={p === look.period} onClick={() => onPeriod(p)}>
                  {copy.periods[p]}
                </button>
              ))}
            </div>
            <span className="sd-sep" aria-hidden="true" />
          </>
        )}
        <div className="sd-chips-set" role="group" aria-label={copy.shape}>
          {sizes.map((s, i) => {
            const f = formatOf(s.shape)
            return (
              <button key={s.name} type="button" className="sd-chip" aria-pressed={i === size} onClick={() => onSize(i)}>
                {copy.sizes[s.name]} <span className="sd-px">{f.w}×{f.h}</span>
              </button>
            )
          })}
        </div>
      </div>
      {spanned && look.period === 'custom' && look.from && look.to && <PeriodRange from={look.from} to={look.to} today={today} first={first} onRange={onRange} />}
    </>
  )
}
