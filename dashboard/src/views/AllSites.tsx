// Every site at a glance, for anyone who runs more than one. On top, what
// needs you (a site that is down or quiet, or far busier than usual); below,
// every site as a tile in the account's groups. Click a tile to open the site.
// Compare puts every site's visitors on one chart.
import { ChartLine, Plus } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'
import { confirmWith } from '../components/Confirm'
import { Loading } from '../components/loading/Loading'
import { AllBar } from '../features/header/AllBar'
import { useStuck } from '../features/header/useStuck'
import { addGroup, EMPTY, flat } from '../features/sites/layout'
import { copy as menu } from '../features/sites/menuCopy'
import { saveLayout, useSiteLayout } from '../features/sites/useSiteLayout'
import { openAddSite } from '../lib/account'
import { type Site } from '../lib/api'
import { lazyLoad } from '../lib/lazyLoad'
import { isViewer } from '../lib/me'
import { AllGroups } from './AllGroups'
import { AllNeeds } from './AllNeeds'
import { AllPeriod, PERIODS } from './AllPeriod'
import { AllSort } from './AllSort'
import { siteColors } from './allSitesColors'
import { copy } from './allSitesCopy'
import { blocksOf } from './allSitesGroups'
import { type OrderKey, saveOrder, savedOrder, sortBy, startIndex } from './allSitesLogic'
import { needsOf } from './allSitesNeeds'
import { useOverview } from './useOverview'
import { useSurges } from './useSurges'
import './AllSites.css'

const Compare = lazyLoad(() => import('./AllCompare'))

export function AllSites({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const [days, setDays] = useState(() => {
    const d = Number(new URLSearchParams(location.search).get('days'))
    return PERIODS.some((p) => p.days === d) ? d : 30
  })
  const { rows, err } = useOverview(days)
  const surges = useSurges(rows)
  // The switcher's order (pins and groups first) until another is picked.
  const [order, setOrder] = useState<OrderKey>(savedOrder)
  const layout = useSiteLayout() ?? EMPTY
  const rank = new Map(flat(sites, layout).map((s, i) => [s.id, i]))
  // A site's colour is its place in the account's list, not its place on this page.
  const colors = siteColors(sites)
  const colorOf = (id: string) => colors.get(id) ?? 'var(--text-3)'
  const [q, setQ] = useState('')
  const [comparing, setComparing] = useState(false)
  const { sentinel, stuck } = useStuck()

  const term = q.trim().toLowerCase()
  const list = rows?.filter((r) => !term || (r.name + ' ' + r.domain).toLowerCase().includes(term)) ?? null
  const sorted = useMemo(
    () => list && sortBy(list, order, rank),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list is rebuilt on every render from rows and q, which are listed in its place
    [rows, order, q, layout],
  )
  const pick = (k: OrderKey) => {
    setOrder(k)
    saveOrder(k)
  }
  const arrange = isViewer() ? null : { sites, layout, save: saveLayout }
  const newGroup = async () => {
    const name = (await confirmWith({ title: menu.newGroupTitle, body: menu.newGroupBody, confirmLabel: menu.create, field: { label: menu.groupName, type: 'text' } }))?.trim()
    if (name) saveLayout(addGroup(layout, name))
  }
  const period = PERIODS.find((p) => p.days === days)?.label ?? ''

  return (
    <>
      <AllBar header={header} />
      <main className="all-sites">
        <div className="all-head">
          <div>
            <h1>{copy.title}</h1>
            <p className="muted">{rows ? copy.count(rows.length, period) : copy.reading}</p>
          </div>
          <div className="all-actions">
            <AllPeriod days={days} onChange={setDays} />
            {rows && rows.length > 1 && (
              <button type="button" className="btn ghost" onClick={() => setComparing(true)}>
                <ChartLine size={15} aria-hidden="true" />
                {copy.compare}
              </button>
            )}
            {!isViewer() && (
              <button type="button" className="btn primary" onClick={openAddSite}>
                <Plus size={15} aria-hidden="true" />
                {copy.addSite}
              </button>
            )}
          </div>
        </div>
        {err && <p className="empty">{err}</p>}
        {!sorted && !err && <Loading height={320} />}
        {sorted && rows && (
          <>
            <AllNeeds needs={needsOf(sites, surges)} sites={sites.length} />
            <div ref={sentinel} className="subbar-sentinel all-sentinel" aria-hidden="true" />
            <div className="all-filters" data-stuck={stuck || undefined}>
              <input className="all-search" type="search" placeholder={copy.search} aria-label={copy.search} value={q} onChange={(e) => setQ(e.target.value)} />
              {arrange && (
                <button type="button" className="btn ghost" onClick={() => void newGroup()}>
                  <Plus size={15} aria-hidden="true" />
                  {copy.newGroup}
                </button>
              )}
              <AllSort value={order} onChange={pick} />
            </div>
            {sorted.length === 0 && term ? (
              <p className="empty">{copy.noMatch}</p>
            ) : (
              <AllGroups blocks={blocksOf(sorted, layout, term !== '')} sites={sites} layout={layout} colorOf={colorOf} days={days} start={startIndex(rows)} arrange={arrange} />
            )}
          </>
        )}
      </main>
      {comparing && rows && (
        <Suspense fallback={null}>
          <Compare rows={rows} days={days} colors={colors} onClose={() => setComparing(false)} />
        </Suspense>
      )}
    </>
  )
}
