// Full's chart tabs, each the chart of one of the cards that used to make up
// the Full grid. One chunk: it comes the first time one of them is opened, and
// they share the numbers they read (useCharts).
import type { CardsCtx } from '../cards/ctx'
import { kitCopy } from '../../charts/copy'
import { Loading } from '../../components/loading/Loading'
import { ConvertCard } from './cards/ConvertCard'
import { FlowCard } from './cards/FlowCard'
import { FunnelCard } from './cards/FunnelCard'
import { MoneyMapCard } from './cards/MoneyMapCard'
import { RhythmCard } from './cards/RhythmCard'
import { OverTime } from './OverTime'
import { copy } from './copy'
import { useCharts } from './useCharts'
import '../../charts/charts.css'

export type ChartTab = 'over-time' | 'hours' | 'revenue-map' | 'visit-to-sale' | 'to-convert' | 'flow'

export default function ChartPanel({ tab, c }: { tab: ChartTab; c: CardsCtx }) {
  const { charts, error } = useCharts(c.site.id, c.query, c.bucket)
  if (error) return <p className="faint kit-error">{copy.failed(error)}</p>
  if (tab === 'over-time') return <OverTime charts={charts} bucket={c.bucket} site={c.site.id} />
  if (tab === 'hours') return <RhythmCard site={c.site.id} query={c.query} timezone={c.site.timezone} />
  if (tab === 'revenue-map') return <MoneyMapCard rows={c.countryRevenue} fmtMoney={c.fmtMoney} onPick={(code) => c.addFilter('country', code)} />
  if (tab === 'flow') return <FlowCard charts={charts} />
  if (!charts) return <Loading height={190} />
  const steps = charts.conversion ?? []
  if (tab === 'visit-to-sale') return steps.length >= 2 ? <FunnelCard steps={steps} /> : <p className="faint kit-empty">{kitCopy.empty}</p>
  const spans = charts.to_convert
  return spans && spans.some((s) => s.sales > 0) ? <ConvertCard spans={spans} /> : <p className="faint kit-empty">{kitCopy.empty}</p>
}
