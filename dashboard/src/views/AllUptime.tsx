// All sites seen as Uptime: for each site a strip of the period's days (green,
// amber for a quiet spell, red for a down one), its uptime, how many incidents
// and for how long. Under one line for the whole account. A row opens that
// site's incident history.
import { useMemo } from 'react'
import { Loading } from '../components/loading/Loading'
import { StateDot } from '../features/sites/StateDot'
import { copy } from '../features/incidents/copy'
import { dayStates, daysBetween, accountTotals, duration, rowTotals, silentAllPeriod, uptimeOf } from '../features/incidents/model'
import { incidentsPath } from '../features/incidents/route'
import { useAccountIncidents, useNow } from '../features/incidents/useIncidents'
import type { Incident } from '../features/incidents/api'
import { addDays, todayIn } from '../lib/dates'
import type { Site } from '../lib/api'
import { navigate } from '../lib/url'
import { copy as all } from './allSitesCopy'
import '../features/incidents/incidentsPage.css'
import './AllUptime.css'

const DAY = 86400
/** The period ids the dashboard knows for the days All sites offers. */
const PERIOD: Record<number, string> = { 7: '7d', 30: '30d', 90: '90d', 365: '12mo' }

function Row({ site, mine, days, now, quiet }: { site: Site; mine: Incident[]; days: number; now: number; quiet?: boolean }) {
  const today = todayIn(site.timezone)
  const states = useMemo(() => dayStates(mine, daysBetween(addDays(today, 1 - days), today), site.timezone, now, site.watched_since), [mine, days, today, site.timezone, now, site.watched_since])
  const t = rowTotals(mine, days, now, site.watched_since)
  const up = uptimeOf(t.span, t.seconds, quiet)
  const figs = up ? [copy.allRow(up.pct.toFixed(1), t.count, duration(t.seconds)), up.downOnly && copy.downOnly].filter(Boolean).join(' · ') : copy.notWatched
  const name = site.name || site.domain
  return (
    <button type="button" className="up-row" aria-label={copy.allOpen(name)} onClick={() => navigate(incidentsPath(site.domain) + '?period=' + PERIOD[days])}>
      <span className="up-name">
        <StateDot site={site} />
        <b title={site.domain}>{name}</b>
      </span>
      <span className="inc-days strip" aria-hidden="true">
        {[...states].map(([d, s]) => (
          <i key={d} className={s} />
        ))}
      </span>
      <span className="up-figs muted">{silentAllPeriod(mine, now - days * DAY) ? copy.noVisitsAll : figs}</span>
    </button>
  )
}

export function AllUptime({ sites, days }: { sites: Site[]; days: number }) {
  const { list, quiet, ready, failed } = useAccountIncidents(days)
  const now = useNow()
  const by = useMemo(() => {
    const m = new Map<string, Incident[]>()
    for (const x of list) m.set(x.site, [...(m.get(x.site) ?? []), x])
    return m
  }, [list])
  if (failed) return <p className="muted" role="alert">{copy.failed}</p>
  if (!ready) return <Loading height={200} />
  const shown = sites
    .map((s) => {
      const t = rowTotals(by.get(s.id) ?? [], days, now, s.watched_since)
      return { s, t, silent: silentAllPeriod(by.get(s.id) ?? [], now - days * DAY) || t.span <= 0 }
    })
    .sort((a, b) => Number(a.silent) - Number(b.silent) || a.t.pct - b.t.pct)
  // A site with no visit all period says nothing about uptime: it stays out of the average.
  const total = accountTotals(sites, list, days, now)
  return (
    <div className="up-wrap">
      <h2 className="up-head">{copy.allSummary(all.siteCount(sites.length), total.pct.toFixed(1), total.count)}</h2>
      <div className="up-list">
        {shown.map((x) => (
          <Row key={x.s.id} site={x.s} mine={by.get(x.s.id) ?? []} days={days} now={now} quiet={quiet[x.s.id]} />
        ))}
      </div>
      <ul className="inc-legend" aria-hidden="true">
        <li className="ok">{copy.legendOk}</li>
        <li className="quiet">{copy.legendQuiet}</li>
        <li className="down">{copy.legendDown}</li>
        {sites.some((s) => (s.watched_since ?? 0) > now - days * DAY) && <li className="unwatched">{copy.legendUnwatched}</li>}
      </ul>
    </div>
  )
}
