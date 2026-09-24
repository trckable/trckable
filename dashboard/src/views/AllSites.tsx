// Every site at a glance, for anyone who runs more than one. Each row is that
// site's own dashboard in one line, read in its own timezone and currency;
// click it to open the site.
import { useEffect, useMemo, useState } from 'react'
import { api, type Site, type SiteRow } from '../lib/api'
import { navigate } from '../lib/url'
import { delta, fmtInt, fmtMoney, fmtPct } from '../lib/format'

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
]

function Spark({ values }: { values: number[] }) {
  const w = 120
  const h = 32
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * w : w / 2, h - 2 - (v / max) * (h - 4)] as const)
  const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join('')
  return (
    <svg className="all-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={line + `L${w} ${h}L0 ${h}Z`} fill="var(--accent)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function AllSites({ header }: { sites: Site[]; header: React.ReactNode }) {
  const [days, setDays] = useState(() => {
    const d = Number(new URLSearchParams(location.search).get('days'))
    return PERIODS.some((p) => p.days === d) ? d : 30
  })
  const [rows, setRows] = useState<SiteRow[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    setErr('')
    api
      .overview(days, ac.signal)
      .then((r) => setRows(r.sites))
      .catch((e: Error) => !ac.signal.aborted && setErr(e.message))
    return () => ac.abort()
  }, [days])

  const sorted = useMemo(() => (rows ? [...rows].sort((a, b) => b.visitors - a.visitors || a.domain.localeCompare(b.domain)) : null), [rows])
  const total = rows?.reduce((a, r) => a + r.visitors, 0) ?? 0
  const prevTotal = rows?.reduce((a, r) => a + r.previous_visitors, 0) ?? 0
  const d = rows ? delta(total, prevTotal) : null

  return (
    <>
      <div className="header">{header}</div>
      <main className="all-sites">
        <div className="all-head">
          <div>
            <h1>All sites</h1>
            <p className="muted">
              {rows ? (
                <>
                  <b className="num">{fmtInt(total)}</b> visitors across {rows.length} site{rows.length === 1 ? '' : 's'}
                  {d && <span className={'delta tone-' + d.tone}> {d.text} vs the period before</span>}
                </>
              ) : (
                'Reading every site…'
              )}
            </p>
          </div>
          <div className="seg" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p.days} type="button" aria-pressed={days === p.days} className={days === p.days ? 'on' : undefined} onClick={() => setDays(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="empty">{err}</p>}
        {!sorted && !err && <div className="skeleton" style={{ height: 240 }} />}
        {sorted && (
          <div className="all-list" role="list">
            <div className="all-row all-cols" aria-hidden="true">
              <span>Site</span>
              <span />
              <span className="n">Visitors</span>
              <span className="n">Pageviews</span>
              <span className="n">Bounce</span>
              <span className="n">Revenue</span>
            </div>
            {sorted.map((r) => {
              // Nothing then and nothing now is not a change worth a number.
              const dv = r.visitors || r.previous_visitors ? delta(r.visitors, r.previous_visitors) : null
              return (
                <button key={r.id} type="button" role="listitem" className="all-row" onClick={() => navigate('/' + encodeURIComponent(r.domain))}>
                  <span className="all-name">
                    <b>{r.name || r.domain}</b>
                    <span className="faint">
                      {r.online > 0 ? (
                        <>
                          <span className="pulse" aria-hidden="true" /> {fmtInt(r.online)} online now
                        </>
                      ) : (
                        r.name && r.name !== r.domain ? r.domain : r.error ? 'could not be read' : ' '
                      )}
                    </span>
                  </span>
                  <Spark values={r.series ?? []} />
                  <span className="n all-big">
                    {fmtInt(r.visitors)}
                    {dv && <span className={'delta tone-' + dv.tone}>{dv.text}</span>}
                  </span>
                  <span className="n">{fmtInt(r.pageviews)}</span>
                  <span className="n">{r.visitors ? fmtPct(r.bounce_rate) : '–'}</span>
                  <span className="n" style={{ color: r.revenue ? 'var(--money)' : 'var(--text-3)' }}>
                    {r.revenue !== undefined ? fmtMoney(r.revenue, r.currency, r.exponent) : '–'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
