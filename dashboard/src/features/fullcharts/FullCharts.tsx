// Full mode's chart cards: one per question. The grid they sit in is
// FullGrid (four columns, two on a tablet, one on a phone). Its own lazy chunk: Compact and
// Live never load it. Cards that need goals, payments or a module are left
// out when there is nothing for them to say.
import type { Bucket, Money, ReportQuery, Row, Site } from '../../lib/api'
import { copy } from './copy'
import { ConvertCard } from './cards/ConvertCard'
import { FlowCard } from './cards/FlowCard'
import { FunnelCard } from './cards/FunnelCard'
import { MoneyMapCard } from './cards/MoneyMapCard'
import { RhythmCard } from './cards/RhythmCard'
import { SourcesCard } from './cards/SourcesCard'
import { VisitorsCard } from './cards/VisitorsCard'
import { useCharts } from './useCharts'
import '../../charts/charts.css'

export interface FullChartsProps {
  site: Site
  query: ReportQuery
  bucket: Bucket
  modules: Partial<Record<string, boolean>> | null
  money?: Money
  countryRevenue: Row[]
  fmtMoney: (minor: number) => string
  onPickCountry: (code: string) => void
}

export default function FullCharts(p: FullChartsProps) {
  const { charts, error } = useCharts(p.site.id, p.query, p.bucket)
  const conversion = charts?.conversion ?? []
  const spans = charts?.to_convert
  // A card with nothing to say drops out, and the grid closes up behind it.
  const sales = !!spans && spans.some((s) => s.sales > 0)
  return (
    <>
      {error && <p className="faint kit-error" data-w={4}>{copy.failed(error)}</p>}
      <SourcesCard charts={charts} bucket={p.bucket} />
      {conversion.length >= 2 && <FunnelCard steps={conversion} />}
      {p.money && spans && sales && <ConvertCard spans={spans} />}
      <VisitorsCard charts={charts} bucket={p.bucket} />
      {p.modules?.rhythm && <RhythmCard site={p.site.id} query={p.query} timezone={p.site.timezone} />}
      {p.money && p.modules?.map !== false && p.countryRevenue.length > 0 && <MoneyMapCard rows={p.countryRevenue} fmtMoney={p.fmtMoney} onPick={p.onPickCountry} />}
      <FlowCard charts={charts} />
    </>
  )
}
