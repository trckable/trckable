// What they did → Pages that sell: the revenue credited to visits that read
// each page. A click filters by the page (visits that read it).
import { useEffect, useState } from 'react'
import { BarList } from '../../charts/BarList'
import { Info } from '../../components/Info'
import type { ReportQuery, Row } from '../../lib/api'
import { extrasApi } from './extrasApi'
import { cardCopy } from '../cards/copy'
import { extrasCopy } from './copy'
import './extras.css'

export default function SalePages({ site, query, money, rows, onPick }: { site: string; query: ReportQuery; money: (minor: number) => string; rows: number; onPick: (page: string) => void }) {
  const [found, setFound] = useState<{ key: string; list: Row[] | null } | null>(null)
  const key = `${site}|${query.from}|${query.to}|${query.attr ?? ''}|${query.testPayments ? 'test' : ''}|${JSON.stringify(query.filters ?? [])}`
  useEffect(() => {
    let live = true
    extrasApi
      .pagesSell(site, query)
      .then((d) => live && setFound({ key, list: d.pages }))
      .catch(() => live && setFound({ key, list: null }))
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed by content
  const here = found && found.key === key ? found : null
  if (here && !here.list) return <p className="faint sp-note">{extrasCopy.sells.failed}</p>
  return (
    <>
      <div className="tc-tools">
        <Info text={extrasCopy.sells.note} align="right" />
      </div>
      <BarList
        dimLabel={extrasCopy.sells.page}
        valueLabel={cardCopy.customers}
        loading={!here}
        byRevenue
        money={money}
        barColor="var(--money)"
        emptyText={extrasCopy.sells.none}
        onPick={onPick}
        items={(here?.list ?? []).slice(0, rows).map((r) => ({ key: r.value, label: r.value || '/', title: r.value, value: r.customers ?? 0, rev: r.revenue }))}
      />
    </>
  )
}
