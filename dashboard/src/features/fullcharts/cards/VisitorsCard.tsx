import { ChartCard } from '../../../charts/ChartCard'
import { SeriesChart } from '../../../charts/SeriesChart'
import { bucketLabel } from '../../../charts/TimeChart'
import type { Bucket } from '../../../lib/api'
import { fmtCompact } from '../../../lib/format'
import type { Charts } from '../api'
import { copy } from '../copy'
import { axisLabels, visitorsModel } from '../model'

export function VisitorsCard({ charts, bucket }: { charts: Charts | null; bucket: Bucket }) {
  const m = charts ? visitorsModel(charts, bucket) : null
  const unknown = charts?.visitors.unknown ?? 0
  return (
    <ChartCard
      id="visitors"
      title={copy.visitors.title}
      question={copy.visitors.question}
      loading={!m}
      table={m?.table ?? { caption: '', columns: [], rows: [] }}
      legend={m?.series.map((s) => ({ label: s.label, color: s.color, line: true }))}
      foot={unknown > 0 && <p className="faint kit-foot">{copy.visitors.unknown(unknown)}</p>}
    >
      {m && charts && (
        <SeriesChart
          series={m.series}
          labels={axisLabels(charts.labels, bucket)}
          label={copy.visitors.label}
          fmt={fmtCompact}
          tipTitle={(i) => bucketLabel(charts.labels[i], bucket, true)}
        />
      )}
    </ChartCard>
  )
}
