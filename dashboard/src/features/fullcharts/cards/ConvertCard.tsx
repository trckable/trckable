import { ChartCard } from '../../../charts/ChartCard'
import { ColumnChart } from '../../../charts/ColumnChart'
import { fmtInt } from '../../../lib/format'
import type { Charts } from '../api'
import { copy } from '../copy'
import { convertModel } from '../model'

export function ConvertCard({ spans }: { spans: NonNullable<Charts['to_convert']> }) {
  const m = convertModel(spans)
  return (
    <ChartCard
      id="convert"
      title={copy.convert.title}
      question={copy.convert.question}
      table={m.table}
      empty={m.values.every((v) => v === 0)}
      foot={<p className="faint kit-foot">{copy.convert.foot}</p>}
    >
      <ColumnChart values={m.values} labels={m.axis} color="var(--money)" label={copy.convert.label} fmt={fmtInt} tip={(i) => copy.convert.tip(m.labels[i], m.values[i])} />
    </ChartCard>
  )
}
