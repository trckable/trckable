// The Briefing's period pill and menu on a page of its own (the incident history): the same words and the same menu, no
// comparison, and the choice goes into the address like the dashboard's (?period, ?from, ?to).
import { PRESETS, type ISODate, type Range } from '../../lib/dates'
import { setView, type ViewState } from '../../lib/url'
import { copy } from '../copy'
import { dayWords, rangeWords } from '../dayWords'
import { periodOptions } from '../periodOptions'
import { PeriodChip } from './PeriodChip'

const grain = (a: ISODate, b: ISODate) => (a === b ? 'by hour' : 'by day')

/** The period as the pill says it: "Today · Fri 16 Oct", "Last 30 days", or the dates. */
export function periodName(period: string, range: Range, today: ISODate): string {
  if (period === 'today' || period === 'yesterday') return `${period === 'today' ? copy.today : copy.yesterday} · ${dayWords(range.to)}`
  return PRESETS.find((q) => q.id === period)?.label ?? rangeWords(range, today, copy.todayWord)
}

export function PagePeriod({ view, range, today }: { view: ViewState; range: Range; today: ISODate }) {
  const { options, more } = periodOptions(today)
  return (
    <PeriodChip
      noCompare
      label={periodName(view.period, range, today)}
      options={options}
      more={more}
      value={view.period}
      compare="none"
      yearOk={false}
      today={today}
      customRange={range}
      grain={grain}
      onPick={(id) => setView({ period: id, from: undefined, to: undefined, compare: 'none' })}
      onCompare={() => undefined}
      onRange={(from, to) => setView({ period: 'custom', from, to, compare: 'none' })}
    />
  )
}
