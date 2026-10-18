// Your links: every tagged link a site has shared (?ref=, utm_source) and what it brought in the period. Reached from the ⋯ menu; a row opens the dashboard for that link alone.
import { useState, type ReactNode } from 'react'
import { Loading } from '../../components/loading/Loading'
import type { Site } from '../../lib/api'
import { rangeOf } from '../../lib/dashQuery'
import { todayIn } from '../../lib/dates'
import { fmtInt, fmtMoney } from '../../lib/format'
import { navigate, readView, useLocation, writeView } from '../../lib/url'
import { PagePeriod } from '../../v2/ui/PagePeriod'
import { PageStats } from '../../v2/ui/PageStats'
import '../../mock/mock.css'
import '../../mock/theme.css'
import { copy } from './copy'
import { Empty } from './Empty'
import { LinkRow } from './LinkRow'
import { LinksTip } from './LinksTip'
import { filterOf } from './model'
import { useLinks } from './useLinks'
import './links.css'

export default function LinksPage({ site, header }: { site: Site; header: ReactNode }) {
  const { params } = useLocation()
  const view = readView(params)
  const today = todayIn(site.timezone)
  const range = rangeOf(view, today)
  const { data, ready, failed, icons } = useLinks(site.id, range.from, range.to)
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const rows = data?.links ?? []
  const max = Math.max(0, ...rows.map((l) => l.visitors))
  const money = data?.currency ? { currency: data.currency, exponent: data.exponent ?? 2 } : undefined
  // The dashboard of this link alone, for the period this page shows.
  const open = (l: (typeof rows)[number]) => navigate('/' + encodeURIComponent(site.domain) + writeView({ ...view, filters: [filterOf(l)], live: false }))
  return (
    <>
      {header}
      <main className="mk mk-body yl-page">
        <div className="yl-head">
          <h1>
            {copy.title} <LinksTip text={copy.tip} />
          </h1>
          <PagePeriod view={view} range={range} today={today} />
        </div>
        {failed && <p className="muted" role="alert">{copy.failed}</p>}
        {!ready && !failed && <Loading height={200} />}
        {ready && !failed && rows.length === 0 && <Empty domain={site.domain} />}
        {rows.length > 0 && (
          <PageStats
            items={[
              { label: copy.statLinks, value: fmtInt(rows.length) },
              { label: <>{copy.visitors} <LinksTip text={copy.sumNote} /></>, value: fmtInt(rows.reduce((n, l) => n + l.visitors, 0)) },
              ...(data?.goals ? [{ label: copy.statGoals, value: fmtInt(rows.reduce((n, l) => n + l.goals, 0)) }] : []),
              ...(money && rows.some((l) => l.revenue) ? [{ label: copy.statRevenue, value: fmtMoney(rows.reduce((n, l) => n + (l.revenue ?? 0), 0), money.currency, money.exponent) }] : []),
            ]}
          />
        )}
        {rows.length > 0 && (
          <div className="yl-list">
            {rows.map((l) => (
              <LinkRow key={l.dim + ':' + l.value} link={l} max={max} now={now} icon={icons.has(l.value)} goals={data?.goals ?? false} money={money} onOpen={() => open(l)} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
