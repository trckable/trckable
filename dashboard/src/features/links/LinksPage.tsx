// Your links: every tagged link a site has shared (?ref=, utm_source) and what it brought in the period. Reached from the ⋯ menu; a row opens the dashboard for that link alone.
import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DatePicker, type PickerValue } from '../../components/DatePicker'
import { Loading } from '../../components/loading/Loading'
import type { Site } from '../../lib/api'
import { rangeOf } from '../../lib/dashQuery'
import { todayIn } from '../../lib/dates'
import { navigate, readView, setView, useLocation, writeView } from '../../lib/url'
import { AllBar } from '../header/AllBar'
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
  const picker: PickerValue = { period: view.period, range, compare: 'none' }
  const { data, ready, failed, icons } = useLinks(site.id, range.from, range.to)
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const rows = data?.links ?? []
  const max = Math.max(0, ...rows.map((l) => l.visitors))
  const money = data?.currency ? { currency: data.currency, exponent: data.exponent ?? 2 } : undefined
  // The dashboard of this link alone, for the period this page shows.
  const open = (l: (typeof rows)[number]) => navigate('/' + encodeURIComponent(site.domain) + writeView({ ...view, filters: [filterOf(l)], live: false }))
  return (
    <>
      <AllBar header={header} />
      <main className="yl-page">
        <div className="yl-head">
          <div>
            <button type="button" className="linkish yl-back" onClick={() => navigate('/' + encodeURIComponent(site.domain))}>
              <ArrowLeft size={14} aria-hidden="true" />
              {copy.back}
            </button>
            <h1>
              {copy.title} <LinksTip text={copy.tip} />
            </h1>
          </div>
          <DatePicker
            noCompare
            value={picker}
            today={today}
            tz={site.timezone}
            onChange={(v) => setView({ period: v.period, from: v.period === 'custom' ? v.range.from : undefined, to: v.period === 'custom' ? v.range.to : undefined, compare: 'none' })}
          />
        </div>
        {failed && <p className="muted" role="alert">{copy.failed}</p>}
        {!ready && !failed && <Loading height={200} />}
        {ready && !failed && rows.length === 0 && <Empty domain={site.domain} />}
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
