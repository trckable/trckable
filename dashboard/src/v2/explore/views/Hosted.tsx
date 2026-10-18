// The tabs whose numbers their own request reads: the highlights, the charts of the old Full page, sources that pay, pages
// that sell, the people, the latest buyers, retention, and AI & search. Each reads what its card always read and is drawn
// as the other tables are; the ones that read the payments show the locked card until they are connected.
import { lazy, Suspense, useState } from 'react'
import { Loading } from '../../../components/loading/Loading'
import { cachedReport, type Report, type ReportQuery } from '../../../lib/api'
import { extrasApi } from '../../../features/extras/extrasApi'
import { extrasCopy } from '../../../features/extras/copy'
import { XEmpty, XError } from '../../ui/XBits'
import { useLoad } from '../data/useLoad'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { HostedTab } from '../types'
import { Lock } from './Lock'
import type { ChartTab } from './hosted/Charts'

const XCharts = lazy(() => import('./hosted/Charts'))
const AiTab = lazy(() => import('./hosted/AiTab'))
const AnswersTab = lazy(() => import('../../../features/answers/AnswersTab'))
const Earners = lazy(() => import('./hosted/Revenue').then((m) => ({ default: m.Earners })))
const SalePages = lazy(() => import('./hosted/Revenue').then((m) => ({ default: m.SalePages })))
const Buyers = lazy(() => import('./hosted/Lines').then((m) => ({ default: m.Buyers })))
const People = lazy(() => import('./hosted/Lines').then((m) => ({ default: m.People })))
const HighlightLines = lazy(() => import('./hosted/Lines').then((m) => ({ default: m.HighlightLines })))
const Retention = lazy(() => import('./hosted/Retention').then((m) => ({ default: m.XRetention })))
const JourneyDialog = lazy(() => import('../../../features/journey/JourneyDialog').then((m) => ({ default: m.JourneyDialog })))

const PAID: HostedTab[] = ['revmap', 'earners', 'sells', 'buyers', 'vsale', 'toconvert']
const CHART: Partial<Record<HostedTab, ChartTab>> = { overtime: 'over-time', hours: 'hours', revmap: 'revenue-map', vsale: 'visit-to-sale', toconvert: 'to-convert', flow: 'flow' }

function Highlighted({ x }: { x: XCtx }) {
  const { from, to, attr, testPayments } = x.query
  const found = useLoad(`hl|${x.site.id}|${from}|${to}|${attr ?? ''}|${testPayments ? 'test' : ''}`, () => extrasApi.insights(x.site.id, x.query).then((d) => d.insights), true)
  if (found.state === 'loading') return <Loading height={180} />
  if (found.state === 'error') return <XError title={extrasCopy.highlights.failed} onRetry={found.retry} />
  if (found.data.length === 0) return <XEmpty title={copy.emptyHighlights} hint={copy.emptyHighlightsHint} />
  return <HighlightLines x={x} list={found.data} />
}

export function Hosted({ tab, x }: { tab: HostedTab; x: XCtx }) {
  const [first, setFirst] = useState(false)
  const [visitor, setVisitor] = useState<string | null>(null)
  const q: ReportQuery = first ? { ...x.query, attr: 'first' } : x.query
  const key = `${x.site.id}|${q.from}|${q.to}|${q.attr ?? ''}|${q.testPayments ? 'test' : ''}|${JSON.stringify(q.filters ?? '')}`
  const loaded = useLoad<Report>(key, (signal) => cachedReport(x.site.id, q, undefined, signal), true)
  if (PAID.includes(tab) && !x.conn.rev) return <Lock k="rev" x={x} />
  if (tab === 'highlights')
    return (
      <Suspense fallback={<Loading height={180} />}>
        <Highlighted x={x} />
      </Suspense>
    )
  if (loaded.state === 'loading') return <Loading height={180} />
  if (loaded.state === 'error') return <XError title={copy.failed} onRetry={loaded.retry} />
  const report = loaded.data
  const chart = CHART[tab]
  return (
    <Suspense fallback={<Loading height={180} />}>
      {chart && <XCharts tab={chart} x={x} report={report} query={q} />}
      {tab === 'earners' && <Earners x={x} report={report} first={first} onAttr={setFirst} />}
      {tab === 'sells' && <SalePages x={x} query={q} />}
      {tab === 'buyers' && <Buyers x={x} query={q} />}
      {tab === 'retention' && <Retention x={x} query={q} />}
      {tab === 'people' && <People x={x} onPick={setVisitor} />}
      {tab === 'ai' && <AiTab x={x} />}
      {tab === 'answers' && <AnswersTab x={x} />}
      {visitor && (
        <JourneyDialog
          site={x.site}
          visitor={visitor}
          query={q}
          onClose={() => setVisitor(null)}
          onFilter={(dim, value) => {
            setVisitor(null)
            x.pick(dim, value)
          }}
        />
      )}
    </Suspense>
  )
}
