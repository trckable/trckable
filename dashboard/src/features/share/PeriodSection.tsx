// The period: a preset, all time, or a range picked on the dashboard's own calendar; and the comparison with the
// period just before, off until asked for and not offered for all time.
import { useState } from 'react'
import { Switch } from '../../components/Switch'
import { todayIn, type ISODate } from '../../lib/dates'
import { Calendar } from '../../v2/ui/PeriodCalendar'
import { PERIODS, type Look, type Period } from './card'
import { copy } from './copy'

const GRAIN = (a: ISODate, b: ISODate) => (a === b ? 'by hour' : 'by day')

export function PeriodSection({ look, tz, set }: { look: Look; tz: string; set: (l: Partial<Look>) => void }) {
  const today = todayIn(tz)
  const [picking, setPicking] = useState(false)
  const range = look.range ?? { from: today, to: today }
  const pick = (p: Period) => {
    setPicking(p === 'custom')
    if (p !== 'custom') set({ period: p })
    else if (look.range) set({ period: p })
  }
  return (
    <>
      <div className="sd-chips" role="group" aria-label={copy.period}>
        {PERIODS.map((p) => (
          <button key={p} type="button" className="sd-chip" aria-pressed={look.period === p || (p === 'custom' && picking)} onClick={() => pick(p)}>
            {copy.periods[p]}
          </button>
        ))}
      </div>
      <p className="sd-hint faint sd-note">{look.period === '24h' ? copy.fullHours : copy.fullDays}</p>
      {picking && (
        <Calendar
          p={{ customRange: range, today, grain: GRAIN }}
          onBack={() => setPicking(false)}
          onApply={(from, to) => {
            set({ period: 'custom', range: { from, to } })
            setPicking(false)
          }}
        />
      )}
      {look.period !== 'all' && (
        <div className="sd-row">
          <span>{copy.compare}</span>
          <Switch on={look.compare} label={copy.compare} onChange={() => set({ compare: !look.compare })} />
        </div>
      )}
      {look.period !== 'all' && <p className="sd-hint faint">{copy.compareHint}</p>}
    </>
  )
}
