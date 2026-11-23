// Over the picture: the periods (for a card that has a span of time), then the sizes the place offers, the picture taking the one picked.
import { PERIODS, formatOf, hasPeriod, type CardId, type Period } from './card'
import { copy } from './copy'
import { placeOf, type Place } from './places'

type Props = { place: Place; size: number; card: CardId; period: Period; onSize: (i: number) => void; onPeriod: (p: Period) => void }

export function SizeBar({ place, size, card, period, onSize, onPeriod }: Props) {
  const sizes = placeOf(place).sizes
  return (
    <div className="sd-chips">
      {hasPeriod(card) && (
        <>
          <div className="sd-chips-set" role="group" aria-label={copy.period}>
            {PERIODS.map((p) => (
              <button key={p} type="button" className="sd-chip" aria-pressed={p === period} onClick={() => onPeriod(p)}>
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
  )
}
