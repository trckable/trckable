// All sites seen as Uptime: for each site a strip of the period's days (green,
// amber for a quiet spell, red for a down one), its uptime, how many incidents
// and for how long. Under one line for the whole account. A row opens that
// site's incident history.
import { useMemo } from 'react'
import { Loading } from '../components/loading/Loading'
import { StateDot } from '../features/sites/StateDot'
import { copy } from '../features/incidents/copy'
import { dayStates, daysBetween, duration, rowTotals } from '../features/incidents/model'
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

function Row({ site, mine, days, now }: { site: Site; mine: Incident[]; days: number; now: number }) {
  const today = todayIn(site.timezone)
  const states = useMemo(() => dayStates(mine, daysBetween(addDays(today, 1 - days), today), site.timezone, now), [mine, days, today, site.timezone, now])
  const t = rowTotals(mine, days, now)
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
      <span className="up-figs muted">{copy.allRow(t.pct.toFixed(1), t.count, duration(t.seconds))}</span>
    </button>
  )
}

export function AllUptime({ sites, days }: { sites: Site[]; days: number }) {
  const { list, ready, failed } = useAccountIncidents(days)
  const now = useNow()
  const by = useMemo(() => {
    const m = new Map<string, Incident[]>()
    for (const x of list) m.set(x.site, [...(m.get(x.site) ?? []), x])
    return m
  }, [list])
  if (failed) return <p className="muted" role="alert">{copy.failed}</p>
  if (!ready) return <Loading height={200} />
  const shown = sites.map((s) => ({ s, t: rowTotals(by.get(s.id) ?? [], days, now) })).sort((a, b) => a.t.pct - b.t.pct)
  const incidents = shown.reduce((n, x) => n + x.t.count, 0)
  const seconds = shown.reduce((n, x) => n + x.t.seconds, 0)
  const pct = Math.max(0, 100 - (seconds / (sites.length * days * DAY)) * 100)
  return (
    <div className="up-wrap">
      <h2 className="up-head">{copy.allSummary(all.siteCount(sites.length), (seconds > 0 && pct >= 99.95 ? 99.9 : pct).toFixed(1), incidents)}</h2>
      <div className="up-list">
        {shown.map((x) => (
          <Row key={x.s.id} site={x.s} mine={by.get(x.s.id) ?? []} days={days} now={now} />
        ))}
      </div>
      <ul className="inc-legend" aria-hidden="true">
        <li className="ok">{copy.legendOk}</li>
        <li className="quiet">{copy.legendQuiet}</li>
        <li className="down">{copy.legendDown}</li>
      </ul>
    </div>
  )
}
