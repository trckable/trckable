// One card, one question: a title, the question it answers, the chart, a
// key, and a switch to the same numbers as a table.
import { useState, type ReactNode } from 'react'
import { kitCopy } from './copy'
import { DataTable, type TableData } from './DataTable'
import { Legend, type LegendItem } from './Legend'
import { Loading } from '../components/loading/Loading'

export function ChartCard(p: {
  id: string
  title: string
  question: string
  table: TableData
  legend?: LegendItem[]
  foot?: ReactNode
  wide?: boolean
  loading?: boolean
  empty?: boolean
  emptyText?: string
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  const head = p.id + '-title'
  const body = () => {
    if (p.loading) return <Loading height={190} />
    if (p.empty) return <p className="faint kit-empty">{p.emptyText ?? kitCopy.empty}</p>
    if (asTable) return <DataTable data={p.table} />
    return p.children
  }
  return (
    // data-w: the columns it asks for in the Full grid, which may widen it
    // to fill a row.
    <section className={p.wide ? 'card kit-card wide' : 'card kit-card'} aria-labelledby={head} aria-busy={p.loading || undefined} data-chart={p.id} data-w={p.wide ? 2 : 1}>
      <div className="kit-head">
        <h2 id={head}>{p.title}</h2>
        {!p.loading && !p.empty && (
          <button
            type="button"
            className="btn ghost kit-switch"
            aria-pressed={asTable}
            aria-label={asTable ? kitCopy.showChart(p.title) : kitCopy.showTable(p.title)}
            onClick={() => setAsTable((t) => !t)}
          >
            {asTable ? kitCopy.chart : kitCopy.table}
          </button>
        )}
      </div>
      <p className="faint kit-question">{p.question}</p>
      <div className="kit-body">{body()}</div>
      {!asTable && !p.loading && !p.empty && p.legend && <Legend items={p.legend} />}
      {!asTable && !p.loading && !p.empty && p.foot}
    </section>
  )
}
