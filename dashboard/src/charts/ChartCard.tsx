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
  /** A key that is not a list of series (the heat grid's shades), in the legend's place. */
  headKey?: ReactNode
  foot?: ReactNode
  wide?: boolean
  loading?: boolean
  empty?: boolean
  emptyText?: string
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  const head = p.id + '-title'
  const ready = !p.loading && !p.empty
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
        {ready && !asTable && (p.legend ? <Legend items={p.legend} /> : p.headKey)}
        {ready && (
          <div className="seg small kit-seg" role="group" aria-label={p.title}>
            <button type="button" aria-pressed={!asTable} aria-label={kitCopy.showChart(p.title)} onClick={() => setAsTable(false)}>
              {kitCopy.chart}
            </button>
            <button type="button" aria-pressed={asTable} aria-label={kitCopy.showTable(p.title)} onClick={() => setAsTable(true)}>
              {kitCopy.table}
            </button>
          </div>
        )}
      </div>
      <p className="faint kit-question">{p.question}</p>
      <div className="kit-body">{body()}</div>
      {!asTable && ready && p.foot}
    </section>
  )
}
