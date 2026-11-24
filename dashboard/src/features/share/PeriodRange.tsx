// The two days of a custom period, under the period chips: from and to, between the site's first data and today.
// A pair that cannot be drawn says why and changes nothing; a good one is the card's period at once.
import { useState } from 'react'
import { fmtDay, type ISODate } from '../../lib/dates'
import { copy } from './copy'
import { rangeProblem } from './range'

type Props = { from: string; to: string; today: ISODate; first?: string; onRange: (from: string, to: string) => void }

export function PeriodRange({ from, to, today, first, onRange }: Props) {
  const [draft, setDraft] = useState({ from, to })
  const problem = rangeProblem(draft.from, draft.to, today, first)
  const say = { future: copy.rangeFuture, early: copy.rangeEarly(first ? fmtDay(first, { year: true }) : ''), order: copy.rangeOrder, missing: copy.rangeMissing }
  const pick = (next: { from: string; to: string }) => {
    setDraft(next)
    if (!rangeProblem(next.from, next.to, today, first)) onRange(next.from, next.to)
  }
  return (
    <div className="sd-range" role="group" aria-label={copy.periods.custom}>
      <label>
        <span>{copy.rangeFrom}</span>
        <input type="date" className="input sd-date" value={draft.from} min={first} max={today} onChange={(e) => pick({ ...draft, from: e.target.value })} />
      </label>
      <label>
        <span>{copy.rangeTo}</span>
        <input type="date" className="input sd-date" value={draft.to} min={first} max={today} onChange={(e) => pick({ ...draft, to: e.target.value })} />
      </label>
      {problem && (
        <span className="sd-range-note" role="alert">
          {say[problem]}
        </span>
      )}
    </div>
  )
}
