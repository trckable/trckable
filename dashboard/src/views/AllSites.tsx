// Every site at a glance, for anyone who runs more than one. The head says what
// is being looked at; period pill and one View menu change the period, what to show,
// which sites and the layout: Overview (the day in a sentence, the sites that matter
// first) or Table (every site as a row, sortable).
import { useMemo } from 'react'
import { Loading } from '../components/loading/Loading'
import { AllBar } from '../features/header/AllBar'
import { type Site } from '../lib/api'
import { AllTable } from './AllTable'
import { AllToday } from './AllToday'
import { AllPeriod } from './AllPeriod'
import { AllUptime } from './AllUptime'
import { AllViewMenu } from './AllViewMenu'
import { siteColors } from './allSitesColors'
import { copy as incidents } from '../features/incidents/copy'
import { copy } from './allSitesCopy'
import { startIndex } from './allSitesLogic'
import type { Lens } from './allLens'
import { useAllView, type ViewLens } from './allView'
import { useOverview } from './useOverview'
import { useSurges } from './useSurges'
import './AllSites.css'

const lensWord = { visitors: copy.lensVisitors, revenue: copy.lensRevenue }

/** The lens of the numbers: Revenue only where something was paid, and Uptime is its own page, so the numbers fall back to Visitors. */
function numbersLens(l: ViewLens, money: boolean): Lens {
  return l === 'revenue' && money ? 'revenue' : 'visitors'
}

export function AllSites({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const [view, change, reset] = useAllView()
  // The overview reads the day from the daily series, so it has no 12 months (weekly) period.
  const days = view.layout === 'overview' && view.lens !== 'uptime' && view.days === 365 ? 30 : view.days
  const { rows: all, err } = useOverview(days)
  const money = !!all?.some((r) => r.revenue !== undefined)
  const uptime = view.lens === 'uptime'
  const lens = numbersLens(view.lens, money)
  const shown = useMemo(() => {
    const picked = sites.filter((s) => view.sites.includes(s.id))
    return picked.length ? picked : sites
  }, [sites, view.sites])
  const rows = useMemo(() => {
    const ids = new Set(shown.map((s) => s.id))
    return all?.filter((r) => ids.has(r.id)) ?? null
  }, [all, shown])
  const surges = useSurges(rows)
  // A site's colour is its place in the account's list, not its place on this page.
  const colors = siteColors(sites)
  const colorOf = (id: string) => colors.get(id) ?? 'var(--text-3)'
  const period = copy.periodLabel(days)
  // The overview's numbers are today's; the period only draws the sparklines.
  const said = view.layout === 'overview' && lens === 'visitors' && !uptime ? copy.periodToday : period
  const count = shown.length === sites.length ? copy.siteCount(sites.length) : copy.siteCountOf(shown.length, sites.length)
  const summary = copy.summary(said, uptime ? incidents.lensUptime : lensWord[lens], count)
  const props = { lens, rows: rows ?? [], sites: shown, colorOf, start: startIndex(rows ?? []), period }

  return (
    <>
      <AllBar header={header} />
      <main className="all-sites">
        <div className="all-head">
          <div>
            <h1>{copy.title}</h1>
            <p className="muted">{rows || uptime ? summary : copy.reading}</p>
          </div>
          <div className="all-actions">
            <AllPeriod view={{ ...view, days }} compared={view.layout === 'table' && lens === 'visitors' && !uptime} change={change} />
            <AllViewMenu view={{ ...view, days }} sites={sites} money={money} change={change} reset={reset} />
          </div>
        </div>
        {err && <p className="empty">{err}</p>}
        {!rows && !err && !uptime && <Loading height={320} />}
        {uptime && <AllUptime sites={shown} days={days} />}
        {rows && !uptime && view.layout === 'overview' && <AllToday {...props} days={days} surges={surges} open={(l) => change({ lens: l })} />}
        {rows && !uptime && view.layout === 'table' && <AllTable {...props} />}
      </main>
    </>
  )
}
