// One chart of an Explore section: its title and key on the section line, the question under it, the chart, and a switch
// to the same numbers as a table.
import { useState, type ReactNode } from 'react'
import { Loading } from '../../../../components/loading/Loading'
import { DataTable, type TableData } from '../../../../charts/DataTable'
import { kitLater } from '../../../../charts/kitLater'
import { XEmpty, XSec } from '../../../ui/XBits'

export interface Key {
  label: string
  color: string
  line?: boolean
}

export function XChart(p: { id: string; title: string; question: string; table: TableData; legend?: Key[]; headKey?: ReactNode; foot?: ReactNode; loading?: boolean; empty?: boolean; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  const ready = !p.loading && !p.empty
  const key = p.legend ? (
    <span className="xlg">
      {p.legend.map((k) => (
        <span key={k.label}>
          <i className={k.line ? 'ln' : ''} style={k.line ? { borderColor: k.color } : { background: k.color }} aria-hidden="true" />
          {k.label}
        </span>
      ))}
    </span>
  ) : (
    p.headKey
  )
  return (
    <section data-chart={p.id} aria-label={p.title} aria-busy={p.loading || undefined}>
      <XSec
        a={p.question}
        b={
          <>
            {ready && !asTable && key}
            {ready && (
              <button type="button" className="xb" aria-pressed={asTable} aria-label={asTable ? kitLater.showChart(p.title) : kitLater.showTable(p.title)} onClick={() => setAsTable(!asTable)}>
                {asTable ? kitLater.chart : kitLater.table}
              </button>
            )}
          </>
        }
      />
      <div className="xchb">
        {p.loading && <Loading height={190} />}
        {p.empty && <XEmpty title={kitLater.empty} hint="" />}
        {ready && (asTable ? <DataTable data={p.table} /> : p.children)}
      </div>
      {!asTable && ready && p.foot}
    </section>
  )
}
