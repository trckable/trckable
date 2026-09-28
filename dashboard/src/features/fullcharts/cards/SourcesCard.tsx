import { ChartCard } from '../../../charts/ChartCard'
import { SeriesChart } from '../../../charts/SeriesChart'
import { bucketLabel } from '../../../charts/TimeChart'
import type { Bucket } from '../../../lib/api'
import { fmtCompact } from '../../../lib/format'
import type { Charts } from '../api'
import { copy } from '../copy'
import { axisLabels, sourcesModel } from '../model'

export function SourcesCard({ charts, bucket }: { charts: Charts | null; bucket: Bucket }) {
  const m = charts ? sourcesModel(charts, bucket) : null
  return (
    <ChartCard
      id="sources"
      wide
      title={copy.sources.title}
      question={copy.sources.question}
      loading={!m}
      empty={!!m && m.series.length === 0}
      table={m?.table ?? { caption: '', columns: [], rows: [] }}
      legend={m?.series.map((s) => ({ label: s.label, color: s.color }))}
    >
      {m && charts && (
        <SeriesChart
          stacked
          series={m.series}
          labels={axisLabels(charts.labels, bucket)}
          label={copy.sources.label(charts.labels.length)}
          fmt={fmtCompact}
          tipTitle={(i) => bucketLabel(charts.labels[i], bucket, true)}
          height={210}
        />
      )}
    </ChartCard>
  )
}
