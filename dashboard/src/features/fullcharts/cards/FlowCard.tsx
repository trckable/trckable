import { ChartCard } from '../../../charts/ChartCard'
import { FlowChart } from '../../../charts/FlowChart'
import type { Charts } from '../api'
import { copy } from '../copy'
import { flowModel } from '../model'

export function FlowCard({ charts }: { charts: Charts | null }) {
  const m = charts ? flowModel(charts) : null
  return (
    <ChartCard
      id="flow"
      wide
      title={copy.flow.title}
      question={copy.flow.question}
      loading={!m}
      empty={!!charts && charts.flow.visits === 0}
      table={m?.table ?? { caption: '', columns: [], rows: [] }}
      foot={<p className="faint kit-foot">{copy.flow.foot}</p>}
    >
      {m && (
        <FlowChart
          cols={m.cols}
          heads={copy.flow.heads}
          links={m.links}
          color="var(--ch-1)"
          label={copy.flow.label}
          boxTip={(_, b) => copy.flow.box(b.label, b.value)}
          bandTip={(a, b, n) => copy.flow.band(a.label, b.label, n)}
        />
      )}
    </ChartCard>
  )
}
