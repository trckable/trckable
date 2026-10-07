// Every site at a glance, for anyone who runs more than one. The top sums
// them up; each site is a card (a few sites) or a slim row (many), read in its
// own timezone and currency; click it to open the site. A site that has had no
// visit yet says so, and opens straight to its install tab.
import { useMemo, useState } from 'react'
import { openAddSite } from '../lib/account'
import { type Site, type SiteRow } from '../lib/api'
import { useOverview } from './useOverview'
import { fmtInt } from '../lib/format'
import { isViewer } from '../lib/me'
import './AllSites.css'
import { openSettings } from '../lib/settings'
import { Loading } from '../components/loading/Loading'
import { Stacked } from './AllSitesChart'
import { siteColors } from './allSitesColors'
import { EMPTY, flat } from '../features/sites/layout'
import { useSiteLayout } from '../features/sites/useSiteLayout'
import { AllBar } from '../features/header/AllBar'
import { AllRows } from './AllRows'
import { AllSort } from './AllSort'
import { AllView } from './AllView'
import { AllSummary } from './AllSummary'
import { copy } from './allSitesCopy'
import { anyPayments, layoutOf, type OrderKey, saveOrder, savedOrder, saveView, savedView, sortBy, startIndex, summarize } from './allSitesLogic'

const PERIODS = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 365, label: '12 months' }]

type Show = 'all' | 'active' | 'waiting' | 'revenue'

const waiting = (r: SiteRow) => !r.visitors && !r.previous_visitors && !r.error
const is: Record<Show, (r: SiteRow) => boolean> = {
  all: () => true,
  active: (r) => r.visitors > 0,
  waiting,
  revenue: (r) => (r.revenue ?? 0) > 0,
}

export function AllSites({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const brandOf = (id: string, domain: string) => sites.find((s) => s.id === id) ?? { domain }
  const [days, setDays] = useState(() => {
    const d = Number(new URLSearchParams(location.search).get('days'))
    return PERIODS.some((p) => p.days === d) ? d : 30
  })
  const { rows, err } = useOverview(days)
  // The switcher's order (pins and groups first) until another is picked.
  const [order, setOrder] = useState<OrderKey>(savedOrder)
  const layout = useSiteLayout() ?? EMPTY
  const rank = new Map(flat(sites, layout).map((s, i) => [s.id, i]))
  // A site's colour is its place in the account's list, not its place on this page.
  const colors = siteColors(sites)
  const colorOf = (id: string) => colors.get(id) ?? 'var(--text-3)'
  const [picked, setPicked] = useState(savedView)
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>('all')

  const list = rows?.filter((r) => is[show](r) && (!q.trim() || (r.name + ' ' + r.domain).toLowerCase().includes(q.trim().toLowerCase()))) ?? null
  const sorted = useMemo(
    () => list && sortBy(list, order, rank),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list is rebuilt on every render from rows, q and show, which are listed in its place
    [rows, order, q, show, layout],
  )
  const pick = (k: OrderKey) => {
    setOrder(k)
    saveOrder(k)
  }
  const s = summarize(list ?? [])
  const start = startIndex(list ?? [])
  const connect = list && !anyPayments(list) && !isViewer() && list.length > 0 ? list[0] : null
  const shape = layoutOf(sorted?.length ?? 0, new URLSearchParams(location.search).get('layout'), picked)

  return (
    <>
      <AllBar header={header} />
      <main className="all-sites">
        <div className="all-head">
          <p className="muted">
            {rows ? (
              <>
                {rows.length} site{rows.length === 1 ? '' : 's'}, the last {PERIODS.find((p) => p.days === days)?.label}
                {list && list.length !== rows.length && <> · showing {list.length}</>}
              </>
            ) : (
              'Reading every site…'
            )}
          </p>
          <div className="all-actions">
            {connect && (
              <button type="button" className="all-link" onClick={() => openSettings(connect, 'payments')}>
                {copy.revenue}: {copy.notConnected.toLowerCase()} · <b>{copy.connect}</b>
              </button>
            )}
            <div className="seg" role="group" aria-label="Period">
              {PERIODS.map((p) => (
                <button key={p.days} type="button" aria-pressed={days === p.days} className={days === p.days ? 'on' : undefined} onClick={() => setDays(p.days)}>
                  {p.label}
                </button>
              ))}
            </div>
            {!isViewer() && (
              <button type="button" className="btn primary" onClick={openAddSite}>
                + Add site
              </button>
            )}
          </div>
        </div>
        {err && <p className="empty">{err}</p>}
        {!sorted && !err && <Loading height={320} />}
        {sorted && list && (
          <>
            <AllSummary s={s} days={days} rows={list} />
            <div className="all-tile all-main">
              <span className="faint">
                {copy.visitors} · {fmtInt(s.total)}
              </span>
              <Stacked rows={list} days={days} colors={colors} start={start} />
            </div>

            <div className="all-filters">
              <div className="seg" role="group" aria-label="Show">
                {(
                  [
                    ['all', 'All'],
                    ['active', 'Active'],
                    ['waiting', 'No visits yet'],
                    ['revenue', 'With revenue'],
                  ] as [Show, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={show === k} className={show === k ? 'on' : undefined} onClick={() => setShow(k)}>
                    {label} <span className="faint">{rows?.filter(is[k]).length}</span>
                  </button>
                ))}
              </div>
              <input className="all-search" type="search" placeholder="Search sites" aria-label="Search sites" value={q} onChange={(e) => setQ(e.target.value)} />
              <AllSort value={order} onChange={pick} />
              <AllView value={shape} onChange={(v) => { setPicked(v); saveView(v) }} />
            </div>

            {sorted.length === 0 ? <p className="empty">No site matches.</p> : <AllRows rows={sorted} layout={shape} total={s.total} start={start} colorOf={colorOf} brandOf={brandOf} />}
          </>
        )}
      </main>
    </>
  )
}
