// Every site at a glance, for anyone who runs more than one. The top sums
// them up; each row is that site's own dashboard in one line, read in its own
// timezone and currency; click it to open the site. A site that has had no
// visit yet says so, and opens straight to its install tab.
import { useMemo, useState } from 'react'
import { openAddSite } from '../lib/account'
import { type Site, type SiteRow } from '../lib/api'
import { useOverview } from './useOverview'
import { delta, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import { isViewer } from '../lib/me'
import { navigate } from '../lib/url'
import './AllSites.css'
import { SiteMark } from '../components/SiteMark'
import { openSettings } from '../lib/settings'
import { Loading } from '../components/loading/Loading'
import { Stacked } from './AllSitesChart'
import { siteColors } from './allSitesColors'
import { Spark } from './AllSitesSpark'
import { EMPTY, flat } from '../features/sites/layout'
import { useSiteLayout } from '../features/sites/useSiteLayout'
import { AllTools } from '../features/header/AllTools'
import { OpenSite } from '../features/sites/OpenSite'
import { copy as sitesCopy } from '../features/sites/menuCopy'

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
]

type SortKey = 'order' | 'visitors' | 'pageviews' | 'bounce_rate' | 'revenue' | 'domain'

type Show = 'all' | 'active' | 'waiting' | 'revenue'

/** A column head that sorts the list by it; pressed again, the other way. */
function Col({ k, label, n, sort, onSort }: { k: SortKey; label: string; n?: boolean; sort: { key: SortKey; desc: boolean }; onSort: (k: SortKey) => void }) {
  return (
    <button
      type="button"
      className={(n ? 'n ' : '') + (sort.key === k ? 'on' : '')}
      aria-label={sort.key === k ? `${label}, sorted ${sort.desc ? 'descending' : 'ascending'}` : label}
      onClick={() => onSort(k)}
    >
      {label}
      {sort.key === k && <span aria-hidden="true">{sort.desc ? ' ↓' : ' ↑'}</span>}
    </button>
  )
}

/** The line under a site's name: who is on it now, a failure, or its domain. */
function subline(r: SiteRow) {
  if (r.online > 0)
    return (
      <>
        <span className="pulse" aria-hidden="true" /> {fmtInt(r.online)} online now
      </>
    )
  if (r.error) return 'could not be read'
  return r.name && r.name !== r.domain ? r.domain : ' '
}

export function AllSites({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const brandOf = (id: string, domain: string) => sites.find((s) => s.id === id) ?? { domain }
  const [days, setDays] = useState(() => {
    const d = Number(new URLSearchParams(location.search).get('days'))
    return PERIODS.some((p) => p.days === d) ? d : 30
  })
  const { rows, err } = useOverview(days)
  // The switcher's order (pins and groups first) until a column is picked.
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'order', desc: false })
  const layout = useSiteLayout() ?? EMPTY
  const rank = new Map(flat(sites, layout).map((s, i) => [s.id, i]))
  // A site's colour is its place in the account's list, not its place on this page.
  const colors = siteColors(sites)
  const colorOf = (id: string) => colors.get(id) ?? 'var(--text-3)'
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>('all')

  const waiting = (r: SiteRow) => !r.visitors && !r.previous_visitors && !r.error
  const is: Record<Show, (r: SiteRow) => boolean> = {
    all: () => true,
    active: (r) => r.visitors > 0,
    waiting,
    revenue: (r) => (r.revenue ?? 0) > 0,
  }
  const list = rows?.filter((r) => is[show](r) && (!q.trim() || (r.name + ' ' + r.domain).toLowerCase().includes(q.trim().toLowerCase()))) ?? null

  const sorted = useMemo(() => {
    if (!list) return null
    if (sort.key === 'order') return [...list].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    const key = sort.key
    const val = (r: SiteRow) => (key === 'domain' ? 0 : (r[key] ?? -1))
    return [...list].sort((a, b) => {
      if (sort.key === 'domain') return (sort.desc ? -1 : 1) * a.domain.localeCompare(b.domain)
      return (sort.desc ? val(b) - val(a) : val(a) - val(b)) || a.domain.localeCompare(b.domain)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list is rebuilt on every render from rows, q and show, which are listed in its place
  }, [rows, sort, q, show, layout])

  const total = list?.reduce((a, r) => a + r.visitors, 0) ?? 0
  const prevTotal = list?.reduce((a, r) => a + r.previous_visitors, 0) ?? 0
  const pageviews = list?.reduce((a, r) => a + r.pageviews, 0) ?? 0
  const bounce = total ? (list ?? []).reduce((a, r) => a + r.bounce_rate * r.visitors, 0) / total : 0
  const online = list?.reduce((a, r) => a + r.online, 0) ?? 0
  const d = list && (total || prevTotal) ? delta(total, prevTotal) : null
  // Revenue adds up only in one currency; otherwise it says how many.
  const paying = list?.filter((r) => r.revenue !== undefined) ?? []
  const currencies = new Set(paying.map((r) => r.currency))
  const revenue =
    paying.length && currencies.size === 1
      ? fmtMoney(
          paying.reduce((a, r) => a + (r.revenue ?? 0), 0),
          paying[0].currency,
          paying[0].exponent,
        )
      : null

  const by = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'domain' }))
  return (
    <>
      <div className="header quiet">
        {header}
        <AllTools />
      </div>
      <main className="all-sites">
        <div className="all-head">
          <div>
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
          </div>
          <div className="all-actions">
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
            <div className="all-top">
              <div className="all-tile all-main">
                <div className="all-main-head">
                  <div>
                    <span className="faint">Visitors</span>
                    <b className="num">{fmtInt(total)}</b>
                    {d && <span className={'delta tone-' + d.tone}>{d.text} vs the {days} days before</span>}
                  </div>
                </div>
                <Stacked rows={list} days={days} colors={colors} />
              </div>
              <div className="all-tiles">
                <div className="all-tile">
                  <span className="faint">Pageviews</span>
                  <b className="num">{fmtInt(pageviews)}</b>
                  <span className="faint">{total ? (pageviews / total).toFixed(1) : '0'} per visitor</span>
                </div>
                <div className="all-tile">
                  <span className="faint">Revenue</span>
                  <b className="num money">{revenue ?? (paying.length ? `${currencies.size} currencies` : '–')}</b>
                  <span className="faint">{paying.length ? `from ${paying.length} site${paying.length === 1 ? '' : 's'}` : 'no payments connected'}</span>
                </div>
                <div className="all-tile">
                  <span className="faint">Bounce rate</span>
                  <b className="num">{total ? fmtPct(bounce) : '–'}</b>
                  <span className="faint">across these sites</span>
                </div>
                <div className="all-tile">
                  <span className="faint">Online now</span>
                  <b className="num">
                    {online > 0 && <span className="pulse" aria-hidden="true" />} {fmtInt(online)}
                  </b>
                  <span className="faint">in the last 5 minutes</span>
                </div>
              </div>
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
              <button type="button" className="btn ghost" aria-pressed={sort.key === 'order'} onClick={() => setSort({ key: 'order', desc: false })}>{sitesCopy.yourOrder}</button>
              <input className="all-search" type="search" placeholder="Search sites" aria-label="Search sites" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="all-list" role="list">
              <div className="all-row all-cols">
                <Col k="domain" label="Site" sort={sort} onSort={by} />
                <span />
                <Col k="visitors" label="Visitors" n sort={sort} onSort={by} />
                <Col k="pageviews" label="Pageviews" n sort={sort} onSort={by} />
                <Col k="bounce_rate" label="Bounce" n sort={sort} onSort={by} />
                <Col k="revenue" label="Revenue" n sort={sort} onSort={by} />
              </div>
              {sorted.length === 0 && <p className="empty">No site matches.</p>}
              {sorted.map((r) => {
                // Nothing then and nothing now is not a change worth a number.
                const dv = r.visitors || r.previous_visitors ? delta(r.visitors, r.previous_visitors) : null
                const quiet = waiting(r)
                const share = total ? r.visitors / total : 0
                return (
                  <div key={r.id} role="listitem" className="all-item">
                  <button
                    type="button"
                    className={'all-row' + (quiet ? ' quiet' : '')}
                    onClick={() => (quiet ? openSettings(r, 'install') : navigate('/' + encodeURIComponent(r.domain)))}
                  >
                    <span className="all-name">
                      <SiteMark site={{ ...brandOf(r.id, r.domain), color: colorOf(r.id) }} size={32} />
                      <span>
                        <b>{r.name || r.domain}</b>
                        <span className="faint">{subline(r)}</span>
                      </span>
                    </span>
                    {quiet ? (
                      // No visit yet: nothing to count, so the rest of the row says what to do.
                      <span className="all-wait">
                        Waiting for the first visit · <b>Install the script →</b>
                      </span>
                    ) : (
                      <Spark values={r.series ?? []} color={colorOf(r.id)} />
                    )}
                    {!quiet && (<>
                    <span className="n all-big">
                      {fmtInt(r.visitors)}
                      {dv && <span className={'delta tone-' + dv.tone}>{dv.text}</span>}
                      {list.length > 1 && !quiet && (
                        <span className="all-share" title={`${Math.round(share * 100)}% of all visitors`}>
                          <i style={{ width: `${Math.max(share * 100, share ? 2 : 0)}%`, background: colorOf(r.id) }} />
                        </span>
                      )}
                    </span>
                    <span className="n">{fmtInt(r.pageviews)}</span>
                    <span className="n">{r.visitors ? fmtPct(r.bounce_rate) : '–'}</span>
                    <span className="n" style={{ color: r.revenue ? 'var(--money)' : 'var(--text-3)' }}>
                      {r.revenue !== undefined ? fmtMoney(r.revenue, r.currency, r.exponent) : '–'}
                    </span>
                    </>)}
                  </button>
                  <OpenSite domain={r.domain} />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </>
  )
}
