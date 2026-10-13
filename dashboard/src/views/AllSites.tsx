// Every site at a glance, for anyone who runs more than one: a live wall of
// tiles to leave open. Each tile says how many are online now, the period's
// line, the visitors with the move and one line about right now; a site that
// is down or quiet comes first, edged warm. Click a tile to open the site.
import { Plus } from 'lucide-react'
import { Loading } from '../components/loading/Loading'
import { AllBar } from '../features/header/AllBar'
import { openAddSite } from '../lib/account'
import { type Site } from '../lib/api'
import { isViewer } from '../lib/me'
import { useState } from 'react'
import { AllPeriod, PERIODS } from './AllPeriod'
import { AllWall } from './AllWall'
import { siteColors } from './allSitesColors'
import { copy } from './allSitesCopy'
import { startIndex } from './allSitesLogic'
import { useOverview } from './useOverview'
import { useSurges } from './useSurges'
import './AllSites.css'

export function AllSites({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const [days, setDays] = useState(() => {
    const d = Number(new URLSearchParams(location.search).get('days'))
    return PERIODS.some((p) => p.days === d) ? d : 30
  })
  const { rows, err } = useOverview(days)
  const surges = useSurges(rows)
  // A site's colour is its place in the account's list, not its place on this page.
  const colors = siteColors(sites)
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
            {!isViewer() && (
              <button type="button" className="btn primary" onClick={openAddSite}>
                <Plus size={15} aria-hidden="true" />
                {copy.addSite}
              </button>
            )}
          </div>
        </div>
        {err && <p className="empty">{err}</p>}
        {!rows && !err && <Loading height={320} />}
        {rows && <AllWall rows={rows} sites={sites} surges={surges} colorOf={(id) => colors.get(id) ?? 'var(--text-3)'} start={startIndex(rows)} />}
      </main>
    </>
  )
}
