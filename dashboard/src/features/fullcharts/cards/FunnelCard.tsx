import { ChartCard } from '../../../charts/ChartCard'
import { FunnelRows } from '../../../charts/FunnelRows'
import type { ConvStep } from '../api'
import { copy } from '../copy'
import { funnelModel } from '../model'

export function FunnelCard({ steps }: { steps: ConvStep[] }) {
  const m = funnelModel(steps)
  return (
    <ChartCard
      id="funnel"
      title={copy.funnel.title}
      question={copy.funnel.question}
      table={m.table}
      foot={<p className="faint kit-foot">{copy.funnel.foot}</p>}
    >
      <FunnelRows rows={m.rows} color="var(--accent)" label={copy.funnel.label} />
    </ChartCard>
  )
}
