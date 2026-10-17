// The tabs whose numbers their own card reads: the highlights, the charts of the old Full page, sources that pay, pages
// that sell, the people, the latest buyers, retention, and AI & search. Each is the card it always was, opened by its
// section; the ones that read the payments show the locked sample until they are connected.
import { lazy, Suspense, useEffect, useState } from 'react'
import { Loading } from '../../../components/loading/Loading'
import { cachedReport, type Report, type ReportQuery } from '../../../lib/api'
import type { CardsCtx } from '../../../features/cards/ctx'
import Highlights, { useInsights } from '../../../features/extras/Highlights'
import { XEmpty } from '../../ui/XBits'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { HostedTab } from '../types'
import { Lock } from './Lock'

const ChartPanel = lazy(() => import('../../../features/fullcharts/ChartPanels'))
const Earners = lazy(() => import('../../../features/cards/Earners'))
const SalePages = lazy(() => import('../../../features/extras/SalePages'))
const Buyers = lazy(() => import('../../../features/extras/Buyers'))
const Retention = lazy(() => import('../../../features/cards/Retention'))
const People = lazy(() => import('../../../features/cards/People'))
const AiSearch = lazy(() => import('../../../features/aisearch/AiSearch'))
const JourneyDialog = lazy(() => import('../../../features/journey/JourneyDialog').then((m) => ({ default: m.JourneyDialog })))

const PAID: HostedTab[] = ['revmap', 'earners', 'sells', 'buyers', 'vsale', 'toconvert']
const CHART = { overtime: 'over-time', hours: 'hours', revmap: 'revenue-map', vsale: 'visit-to-sale', toconvert: 'to-convert', flow: 'flow' } as const

/** What the old cards read from their page, made from the period's report. */
function ctxOf(x: XCtx, q: ReportQuery, report: Report, first: boolean, onAttr: (f: boolean) => void, onVisitor: (v: string) => void): CardsCtx {
  const cur = report.current
  const dims = (d: string) => cur.dims[d] ?? []
  return {
    site: x.site, query: q, bucket: report.bucket, full: true, shared: false, deep: true, loading: false, scrubbing: false, mods: null, money: cur.money, fmtMoney: x.money,
    rows: 10, cur, prev: undefined, compare: false, dims, sourceRows: dims, perDay: () => false, trail: null, dimTrail: false, onSourceHover: () => undefined, addFilter: x.pick, mapOn: true,
    goals: cur.goals ?? [], revenueDims: cur.revenue_dims ?? {}, countryRevenue: cur.revenue_dims?.country ?? [], attrFirst: first, onAttr, onTrackGoal: () => x.connect('goals'), onFull: () => undefined,
    steps: [], onSteps: () => undefined, onPickVisitor: onVisitor, visitors: cur.kpis.visitors,
  }
}

function Highlighted({ x }: { x: XCtx }) {
  const found = useInsights(x.site.id, x.query, true)
  if (!found) return <Loading height={180} />
  if (found.length === 0) return <XEmpty title={copy.emptyHighlights} hint={copy.emptyHighlightsHint} />
  return <Highlights list={found} money={x.money} onPick={x.pick} />
}

export function Hosted({ tab, x }: { tab: HostedTab; x: XCtx }) {
  const [first, setFirst] = useState(false)
  const [got, setGot] = useState<{ key: string; report: Report } | null>(null)
  const [visitor, setVisitor] = useState<string | null>(null)
  const q: ReportQuery = first ? { ...x.query, attr: 'first' } : x.query
  const key = `${x.site.id}|${q.from}|${q.to}|${q.attr ?? ''}|${JSON.stringify(q.filters ?? '')}`
  useEffect(() => {
    let live = true
    void cachedReport(x.site.id, q).then((report) => live && setGot({ key, report }))
    return () => {
      live = false
    }
    // The key says what the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (PAID.includes(tab) && !x.conn.rev) return <Lock k="rev" x={x} />
  if (tab === 'highlights') return <Highlighted x={x} />
  const report = got?.key === key ? got.report : null
  if (!report) return <Loading height={180} />
  const c = ctxOf(x, q, report, first, setFirst, setVisitor)
  const chart = tab in CHART ? CHART[tab as keyof typeof CHART] : null
  return (
    <Suspense fallback={<Loading height={180} />}>
      {chart && <ChartPanel tab={chart} c={c} />}
      {tab === 'earners' && <Earners c={c} />}
      {tab === 'sells' && <SalePages site={x.site.id} query={q} money={x.money} rows={c.rows} onPick={(page) => x.pick('page', page)} />}
      {tab === 'buyers' && <Buyers site={x.site.id} query={q} money={x.money} />}
      {tab === 'retention' && <Retention site={x.site} query={q} />}
      {tab === 'people' && <People site={x.site} onPick={setVisitor} />}
      {tab === 'ai' && <AiSearch c={c} />}
      {visitor && <JourneyDialog site={x.site} visitor={visitor} query={q} onClose={() => setVisitor(null)} onFilter={(dim, value) => {
          setVisitor(null)
          x.pick(dim, value)
        }} />}
    </Suspense>
  )
}
