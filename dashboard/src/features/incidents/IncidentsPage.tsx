// A site's uptime and incidents: how the site is right now with the period's uptime beside it, the figures the incident
// rows add up to, a day-by-day strip (a year's grid for a long period) and the incidents themselves with what our checks
// saw. Reached from the status panel, the chart's marks and the ⋯ menu; Esc and the browser's back go back to the dashboard.
import { Check } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Loading } from '../../components/loading/Loading'
import { rangeOf } from '../../lib/dashQuery'
import { fmtDay, PRESETS, todayIn } from '../../lib/dates'
import type { Site } from '../../lib/api'
import { navigate, readView, useLocation } from '../../lib/url'
import { PagePeriod } from '../../v2/ui/PagePeriod'
import { copy as v2 } from '../../v2/copy'
import { rangeWords } from '../../v2/dayWords'
import { copy } from './copy'
import { Hero } from './Hero'
import { IncidentList } from './IncidentList'
import { dayIn, figuresOf, silentAllPeriod, standingOf, startOfDay } from './model'
import { Timeline } from './Timeline'
import { useClock, useNow, useOpenIncident, usePeriodIncidents } from './useIncidents'
import type { Incident } from './api'
import '../../mock/mock.css'
import '../../kit/layout.css'
import '../../mock/theme.css'
import './incidentsPage.css'

/** The period as a sentence part: "30 days", "this month", "today", or the dates. */
function overWords(period: string, range: { from: string; to: string }, today: string): string {
  const preset = PRESETS.find((q) => q.id === period)?.label
  if (period === 'custom' || !preset) return rangeWords(range, today, v2.todayWord)
  return period === 'today' ? v2.todayWord : preset.replace(/^Last (?=\d)/, '').replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())
}

export default function IncidentsPage({ site, header }: { site: Site; header: ReactNode }) {
  const { params } = useLocation()
  const view = readView(params)
  const today = todayIn(site.timezone)
  const range = rangeOf(view, today)
  const now = useNow()
  const clock = useClock()
  const periodFrom = startOfDay(range.from, site.timezone)
  const to = Math.min(startOfDay(range.to, site.timezone) + 86400, now)
  // Only the time we were watching counts: before that, nothing is known.
  const from = Math.min(Math.max(periodFrom, site.watched_since ?? 0), to)
  const period = usePeriodIncidents(site.id, from, to)
  const open = useOpenIncident(site.id)
  const [edited, setEdited] = useState<Record<string, Incident>>({})
  // Esc goes back to the dashboard (the browser's back does as well), unless a menu or a field has it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]') || document.querySelector('.pmenu.on, [popover]:popover-open')) return
      navigate('/' + encodeURIComponent(site.domain))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [site.domain])
  const list = period.list.map((x) => edited[x.id] ?? x).sort((a, b) => b.started_at - a.started_at)
  const since = (site.watched_since ?? 0) > periodFrom ? fmtDay(dayIn(site.watched_since ?? 0, site.timezone), { year: true }) : undefined
  const span = to - from
  const ready = period.ready && !period.failed
  return (
    <>
      {header}
      <main className="mk mk-body inc-page">
        <div className="inc-head">
          <h1>{copy.title}</h1>
          <PagePeriod view={view} range={range} today={today} />
        </div>
        {period.failed && <p className="inc-fail" role="alert">{copy.failed}</p>}
        {!period.ready && !period.failed && <Loading height={140} />}
        {ready && (
          <>
            <Hero
              now={standingOf(site.down_since, open)}
              at={clock}
              f={figuresOf(list, from, to, now)}
              w={{ span, since, quietTracked: period.quietTracked, silent: silentAllPeriod(list, from) }}
              over={overWords(view.period, range, today)}
            />
            <Timeline list={list} from={range.from} to={range.to} tz={site.timezone} now={now} watchedSince={site.watched_since} since={since} />
            {list.length > 0 && <IncidentList domain={site.domain} list={list} now={now} edit={(x) => setEdited((e) => ({ ...e, [x.id]: x }))} />}
            {list.length === 0 && span > 0 && (
              <p className="inc-empty">
                <Check size={16} strokeWidth={2.25} aria-hidden="true" />
                {copy.empty}
              </p>
            )}
          </>
        )}
      </main>
    </>
  )
}
