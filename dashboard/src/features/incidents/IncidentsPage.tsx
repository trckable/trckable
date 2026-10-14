// A site's uptime and incidents: the period's figures, a day-by-day timeline
// (a year's grid for a long period) and every incident with what our checks
// saw. Reached from the status panel, the chart's marks and the ⋯ menu.
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { DatePicker, periodLabel, type PickerValue } from '../../components/DatePicker'
import { AllBar } from '../header/AllBar'
import { Loading } from '../../components/loading/Loading'
import { rangeOf } from '../../lib/dashQuery'
import { fmtDay, todayIn } from '../../lib/dates'
import type { Site } from '../../lib/api'
import { navigate, readView, setView, useLocation } from '../../lib/url'
import { copy } from './copy'
import { IncidentList } from './IncidentList'
import { dayIn, silentAllPeriod, startOfDay } from './model'
import { Summary } from './Summary'
import { Timeline } from './Timeline'
import { useIncidentList, useNow, usePeriodIncidents } from './useIncidents'
import './incidentsPage.css'

export default function IncidentsPage({ site, header }: { site: Site; header: ReactNode }) {
  const { params } = useLocation()
  const view = readView(params)
  const today = todayIn(site.timezone)
  const range = rangeOf(view, today)
  const picker: PickerValue = { period: view.period, range, compare: 'none' }
  const now = useNow()
  const periodFrom = startOfDay(range.from, site.timezone)
  const to = Math.min(startOfDay(range.to, site.timezone) + 86400, now)
  // Only the time we were watching counts: before that, nothing is known.
  const from = Math.min(Math.max(periodFrom, site.watched_since ?? 0), to)
  const period = usePeriodIncidents(site.id, from, to)
  const all = useIncidentList(site.id)
  const since = (site.watched_since ?? 0) > periodFrom ? fmtDay(dayIn(site.watched_since ?? 0, site.timezone), { year: true }) : undefined
  return (
    <>
      <AllBar header={header} />
      <main className="inc-page">
        <div className="inc-head">
          <div>
            <button type="button" className="linkish inc-back" onClick={() => navigate('/' + encodeURIComponent(site.domain))}>
              <ArrowLeft size={14} aria-hidden="true" />
              {copy.back}
            </button>
            <h1>{copy.title}</h1>
            <p className="muted">{site.name || site.domain}</p>
          </div>
          <DatePicker
            value={picker}
            today={today}
            tz={site.timezone}
            onChange={(v) => setView({ period: v.period, from: v.period === 'custom' ? v.range.from : undefined, to: v.period === 'custom' ? v.range.to : undefined, compare: 'none' })}
          />
        </div>
        {period.failed && <p className="muted" role="alert">{copy.failed}</p>}
        {!period.ready && !period.failed && <Loading height={140} />}
        {period.summary && (
          <>
            <Summary totals={period.summary} silent={silentAllPeriod(period.list, from)} label={periodLabel(picker, today)} watch={{ span: to - from, since, quietTracked: period.quietTracked }} />
            <Timeline list={period.list} from={range.from} to={range.to} tz={site.timezone} now={now} watchedSince={site.watched_since} />
          </>
        )}
        {!all.ready && !period.failed && <Loading height={120} />}
        {all.ready && (all.list.length > 0 || all.failed) && <IncidentList list={all.list} next={all.next} busy={all.busy} failed={all.failed} now={now} more={all.more} edit={all.edit} />}
        <p className="muted inc-foot">{copy.quietNote}</p>
      </main>
    </>
  )
}
