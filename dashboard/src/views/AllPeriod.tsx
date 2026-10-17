// The period of All sites, in the head: the same pill as the site dashboard's
// (calendar, the period, a chevron), opening the periods All sites can read.
// Beside it, in words, what the change is against, only where the numbers
// really are compared: the table's visitors against the days just before (the
// overview compares today with the same weekday, not the period).
import { Calendar, Check, ChevronDown } from 'lucide-react'
import { compareWords } from '../components/DatePicker'
import { addDays } from '../lib/dates'
import { Popover } from '../kit'
import { copy } from './allSitesCopy'
import { PERIOD_DAYS, type View } from './allView'

/** The periods on offer: the overview reads its day from the daily series, which a 12 months period (weekly) does not have; the table and Uptime do. */
export const periodsFor = (view: Pick<View, 'layout' | 'lens'>) => PERIOD_DAYS.filter((d) => view.layout === 'table' || view.lens === 'uptime' || d < 365)

/** What the numbers are against, as the site dashboard words it ("vs the 30 days before"). */
function against(days: number): string {
  const to = '2000-01-01'
  return compareWords({ period: `${days}d`, range: { from: addDays(to, 1 - days), to }, compare: 'previous' })
}

/** `charts`: the numbers are today's and the period only draws the charts, so the button says so. */
export function AllPeriod({ view, compared, charts, change }: { view: View; compared: boolean; charts: boolean; change: (c: Partial<View>) => void }) {
  return (
    <div className="all-period">
      <Popover
        label={copy.period}
        className="menu all-period-pop"
        trigger={(p) => (
          <button type="button" className="btn range" {...p} aria-haspopup="menu">
            <Calendar size={15} strokeWidth={1.75} className="range-icon" aria-hidden="true" />
            <span className="range-label">{charts ? copy.periodCharts(copy.periodLabel(view.days)) : copy.periodLabel(view.days)}</span>
            <ChevronDown size={13} strokeWidth={1.75} className="range-chev" aria-hidden="true" />
          </button>
        )}
      >
        {(close) => (
          <div className="menu-list" role="menu" aria-label={copy.period}>
            {periodsFor(view).map((d) => (
              <button
                key={d}
                type="button"
                role="menuitemradio"
                aria-checked={d === view.days}
                onClick={() => {
                  change({ days: d })
                  close()
                }}
              >
                {copy.periodLabel(d)}
                {d === view.days && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </Popover>
      {compared && <span className="all-period-vs">{against(view.days)}</span>}
    </div>
  )
}
