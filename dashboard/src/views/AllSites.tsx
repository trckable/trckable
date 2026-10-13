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
import { useMemo, useState } from 'react'
import { AllPeriod, PERIODS } from './AllPeriod'
import { LensSwitch, lensFromUrl, SitePicker, type Lens } from './allLens'
import { AllMission } from './AllMission'
import { AllTable } from './AllTable'
import { AllToday } from './AllToday'
import { AllWall } from './AllWall'
import { siteColors } from './allSitesColors'
import { copy } from './allSitesCopy'
import { startIndex } from './allSitesLogic'
import { useOverview } from './useOverview'
import { useSurges } from './useSurges'
import './AllSites.css'

// The three directions under test: /all?design=1|2|3. Today reads the day from the
// daily series, so it leaves out the 12 months (weekly) period.
const DESIGN = Number(new URLSearchParams(location.search).get('design')) || 0

export function AllSites({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const [days, setDays] = useState(() => {
    const d = Number(new URLSearchParams(location.search).get('days'))
    return PERIODS.some((p) => p.days === d) && !(d === 365 && DESIGN > 0) ? d : 30
  })
  const [lens, setLens] = useState<Lens>(lensFromUrl)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const { rows: all, err } = useOverview(days)
  const money = !!all?.some((r) => r.revenue !== undefined)
  const rows = useMemo(() => (all && picked.size ? all.filter((r) => picked.has(r.id)) : all), [all, picked])
  const shown = picked.size ? sites.filter((s) => picked.has(s.id)) : sites
  const showLens: Lens = lens === 'revenue' && !money ? 'visitors' : lens
  const chooseLens = (l: Lens) => {
    setLens(l)
    const u = new URL(location.href)
    u.searchParams.set('lens', l)
    history.replaceState(null, '', u)
  }
  const surges = useSurges(rows)
  // A site's colour is its place in the account's list, not its place on this page.
  const colors = siteColors(sites)
  const colorOf = (id: string) => colors.get(id) ?? 'var(--text-3)'
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
            {DESIGN > 0 && <LensSwitch lens={showLens} onChange={chooseLens} money={money} />}
            {DESIGN > 0 && <SitePicker sites={sites} picked={picked} onChange={setPicked} />}
            <AllPeriod days={days} onChange={setDays} periods={DESIGN > 0 ? PERIODS.filter((p) => p.days < 365) : PERIODS} />
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
        {rows && DESIGN === 1 && <AllToday lens={showLens} rows={rows} sites={shown} surges={surges} colorOf={colorOf} start={startIndex(rows)} period={period} />}
        {rows && DESIGN === 2 && <AllTable lens={showLens} rows={rows} sites={shown} colorOf={colorOf} start={startIndex(rows)} period={period} />}
        {rows && DESIGN === 3 && <AllMission lens={showLens} rows={rows} sites={shown} colorOf={colorOf} />}
        {rows && (DESIGN < 1 || DESIGN > 3) && <AllWall rows={rows} sites={sites} surges={surges} colorOf={colorOf} start={startIndex(rows)} />}
      </main>
    </>
  )
}
