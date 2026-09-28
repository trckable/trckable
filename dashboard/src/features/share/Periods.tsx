// 24 hours, 7 days or 30 days: in the head on a wide screen, under the cards on a phone.
import { PERIODS, type Period } from './card'
import { copy } from './copy'

export function Periods({ value, onChange, className }: { value: Period; onChange: (p: Period) => void; className: string }) {
  return (
    <div className={'seg small ' + className} role="group" aria-label={copy.period}>
      {PERIODS.map((p) => (
        <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)}>
          {copy.periods[p]}
        </button>
      ))}
    </div>
  )
}
