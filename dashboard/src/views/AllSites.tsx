// Every site at a glance, for anyone who runs more than one. The top sums
// them up; each row is that site's own dashboard in one line, read in its own
// timezone and currency; click it to open the site. A site that has had no
// visit yet says so, and opens straight to its install tab.
import { useEffect, useMemo, useState } from 'react'
import { openAddSite } from '../lib/account'
import { api, type Site, type SiteRow } from '../lib/api'
import { delta, fmtInt, fmtMoney, fmtPct } from '../lib/format'
import { isViewer } from '../lib/me'
import { navigate } from '../lib/url'
import './AllSites.css'
import { SiteMark, hueOf as hueFromDomain } from '../components/SiteMark'
import { openSettings } from '../lib/settings'

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
]

type SortKey = 'visitors' | 'pageviews' | 'bounce_rate' | 'revenue' | 'domain'

/** Stretches to its column; the line keeps its width however wide it gets. */
function Spark({ values, color = 'var(--accent)', w = 140, h = 36 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * w : w / 2, h - 2 - (v / max) * (h - 4)] as const)
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join('')
  return (
    <svg className="all-spark" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={line + `L${w} ${h}L0 ${h}Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** A site's hue, from its domain, so its chart band, spark and share bar
    stay the same everywhere (components/SiteMark.tsx). */
const hueOf = hueFromDomain

/** Every site's visitors over the period, stacked, each in its own colour.
    Point at a day to read each site's share of it. */
function Stacked({ rows, days }: { rows: SiteRow[]; days: number }) {
  const [at, setAt] = useState<number | null>(null)
  const shown = rows.filter((r) => r.series?.some((v) => v > 0))
  const n = Math.max(0, ...shown.map((r) => r.series?.length ?? 0))
  if (!n) return <div className="all-chart-empty faint">No visits in this period yet.</div>
  const W = 640
  const H = 180
  const sums = Array.from({ length: n }, (_, i) => shown.reduce((a, r) => a + (r.series?.[i] ?? 0), 0))
  const max = Math.max(1, ...sums)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const y = (v: number) => H - (v / max) * (H - 8)
  // Bottom-up: the biggest site sits at the bottom, the smaller ones on top.
  const order = [...shown].sort((a, b) => b.visitors - a.visitors)
  const base = new Array<number>(n).fill(0)
  const bands = order.map((r) => {
    const lo = [...base]
    const hi = base.map((b, i) => b + (r.series?.[i] ?? 0))
    hi.forEach((v, i) => (base[i] = v))
    const top = hi.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
    const bottom = lo.map((_, i) => `L${x(n - 1 - i).toFixed(1)} ${y(lo[n - 1 - i]!).toFixed(1)}`).join('')
    return { r, d: top + bottom + 'Z', line: top }
  })
  const step = days / n // days per point: a day, or a week for 12 months
  const when = (i: number) => {
    const d = new Date(Date.now() - Math.round((n - 1 - i) * step) * 864e5)
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }
  return (
    <div className="all-chart" onMouseLeave={() => setAt(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="all-chart-svg"
        onMouseMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect()
          setAt(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - b.left) / b.width) * (n - 1)))))
        }}
        role="img"
        aria-label="Visitors per day, every site stacked"
      >
        {bands.map(({ r, d, line }) => (
          <g key={r.id}>
            <path d={d} fill={`hsl(${hueOf(r.domain)} 70% 60% / 0.16)`} />
            <path d={line} fill="none" stroke={`hsl(${hueOf(r.domain)} 80% 65%)`} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {at !== null && <line x1={x(at)} x2={x(at)} y1="0" y2={H} stroke="var(--text-3)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="all-chart-axis faint">
        <span>{when(0)}</span>
        <span>{when(n - 1)}</span>
      </div>
      {at !== null && (
        <div className="all-chart-tip" style={{ left: `${(x(at) / W) * 100}%` }}>
          <b>{when(at)}</b>
          {order.map((r) => (
            <span key={r.id}>
              <i style={{ background: `hsl(${hueOf(r.domain)} 80% 65%)` }} />
              {r.name || r.domain}
              <em>{fmtInt(r.series?.[at] ?? 0)}</em>
            </span>
          ))}
          <span className="sum">
            All sites <em>{fmtInt(sums[at] ?? 0)}</em>
          </span>
        </div>
      )}
      <div className="all-legend">
        {order.map((r) => (
          <span key={r.id}>
            <i style={{ background: `hsl(${hueOf(r.domain)} 80% 65%)` }} />
            {r.name || r.domain}
          </span>
        ))}
      </div>
    </div>
  )
}

type Show = 'all' | 'active' | 'waiting' | 'revenue'

export function AllSites({ sites, header }: { sites: Site[]; header: React.ReactNode }) {
  const brandOf = (id: string, domain: string) => sites.find((s) => s.id === id) ?? { domain }
  const [days, setDays] = useState(() => {
    const d = Number(new URLSearchParams(location.search).get('days'))
    return PERIODS.some((p) => p.days === d) ? d : 30
  })
  const [rows, setRows] = useState<SiteRow[] | null>(null)
  const [err, setErr] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'visitors', desc: true })
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>('all')

  useEffect(() => {
    const ac = new AbortController()
    setErr('')
    api
      .overview(days, ac.signal)
      .then((r) => setRows(r.sites))
      .catch((e: Error) => !ac.signal.aborted && setErr(e.message))
    return () => ac.abort()
  }, [days])

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
    const val = (r: SiteRow) => (sort.key === 'domain' ? 0 : ((r[sort.key] as number | undefined) ?? -1))
    return [...list].sort((a, b) => {
      if (sort.key === 'domain') return (sort.desc ? -1 : 1) * a.domain.localeCompare(b.domain)
      return (sort.desc ? val(b) - val(a) : val(a) - val(b)) || a.domain.localeCompare(b.domain)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, q, show])

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
          paying[0]!.currency,
          paying[0]!.exponent,
        )
      : null

  const by = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'domain' }))
  const Col = ({ k, label, n }: { k: SortKey; label: string; n?: boolean }) => (
    <button
      type="button"
      className={(n ? 'n ' : '') + (sort.key === k ? 'on' : '')}
      aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      onClick={() => by(k)}
    >
      {label}
      {sort.key === k && <span aria-hidden="true">{sort.desc ? ' ↓' : ' ↑'}</span>}
    </button>
  )

  return (
    <>
      <div className="header">{header}</div>
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
        {!sorted && !err && <div className="skeleton" style={{ height: 320 }} />}
        {sorted && (
          <>
            <div className="all-top">
              <div className="all-tile all-main">
                <div className="all-main-head">
                  <div>
                    <span className="faint">Visitors</span>
                    <b className="num">{fmtInt(total)}</b>
                    {d && <span className={'delta tone-' + d.tone}>{d.text} vs the period before</span>}
                  </div>
                </div>
                <Stacked rows={list!} days={days} />
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
                    {label} <span className="faint">{rows!.filter(is[k]).length}</span>
                  </button>
                ))}
              </div>
              <input className="all-search" type="search" placeholder="Search sites" aria-label="Search sites" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="all-list" role="list">
              <div className="all-row all-cols">
                <Col k="domain" label="Site" />
                <span />
                <Col k="visitors" label="Visitors" n />
                <Col k="pageviews" label="Pageviews" n />
                <Col k="bounce_rate" label="Bounce" n />
                <Col k="revenue" label="Revenue" n />
              </div>
              {sorted.length === 0 && <p className="empty">No site matches.</p>}
              {sorted.map((r) => {
                // Nothing then and nothing now is not a change worth a number.
                const dv = r.visitors || r.previous_visitors ? delta(r.visitors, r.previous_visitors) : null
                const quiet = waiting(r)
                const share = total ? r.visitors / total : 0
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="listitem"
                    className={'all-row' + (quiet ? ' quiet' : '')}
                    onClick={() => (quiet ? openSettings(r, 'install') : navigate('/' + encodeURIComponent(r.domain)))}
                  >
                    <span className="all-name">
                      <SiteMark site={brandOf(r.id, r.domain)} size={32} />
                      <span>
                        <b>{r.name || r.domain}</b>
                        <span className="faint">
                          {r.online > 0 ? (
                            <>
                              <span className="pulse" aria-hidden="true" /> {fmtInt(r.online)} online now
                            </>
                          ) : r.error ? (
                            'could not be read'
                          ) : r.name && r.name !== r.domain ? (
                            r.domain
                          ) : (
                            ' '
                          )}
                        </span>
                      </span>
                    </span>
                    {quiet ? (
                      // No visit yet: nothing to count, so the rest of the row says what to do.
                      <span className="all-wait">
                        Waiting for the first visit · <b>Install the script →</b>
                      </span>
                    ) : (
                      <Spark values={r.series ?? []} color={`hsl(${hueOf(r.domain)} 80% 65%)`} />
                    )}
                    {!quiet && (<>
                    <span className="n all-big">
                      {fmtInt(r.visitors)}
                      {dv && <span className={'delta tone-' + dv.tone}>{dv.text}</span>}
                      {list!.length > 1 && !quiet && (
                        <span className="all-share" title={`${Math.round(share * 100)}% of all visitors`}>
                          <i style={{ width: `${Math.max(share * 100, share ? 2 : 0)}%`, background: `hsl(${hueOf(r.domain)} 80% 65%)` }} />
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
                )
              })}
            </div>
          </>
        )}
      </main>
    </>
  )
}
