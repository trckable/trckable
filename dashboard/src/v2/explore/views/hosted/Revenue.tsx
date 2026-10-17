// What the money says, as the other tables do: sources that pay (with the switch for which visit gets the credit) and
// the pages that sell, each from the numbers the old cards read.
import { useEffect, useState } from 'react'
import { XEmpty, XSub } from '../../../ui/XBits'
import { XCols, type CRow } from '../../../ui/XTable'
import type { Report, ReportQuery, Row } from '../../../../lib/api'
import { fmtInt } from '../../../../lib/format'
import { channelLabel } from '../../../../lib/palette'
import { laterCopy } from '../../../../features/cards/copyLater'
import { DIM_LABEL } from '../../../../features/overview/dimLabels'
import { extrasApi } from '../../../../features/extras/extrasApi'
import { extrasCopy } from '../../../../features/extras/copy'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'

const DIMS = ['channel', 'referrer', 'campaign', 'entry_page'] as const
const COLS = [{ h: laterCopy.customers, hm: true }, { h: copy.heads.revenue }, { h: laterCopy.perVisitor, hm: true }]
const XC = 'minmax(0,1fr) 84px 84px 84px'
const XCM = 'minmax(0,1fr) 72px'

const dimName = (d: string) => (d === 'entry_page' ? laterCopy.page : DIM_LABEL[d])

export function Earners({ x, report, first, onAttr }: { x: XCtx; report: Report; first: boolean; onAttr: (first: boolean) => void }) {
  const [asked, setAsked] = useState<(typeof DIMS)[number]>('channel')
  const seen = new Map((report.current.dims[asked] ?? []).map((r) => [r.value, r.visitors]))
  const list = report.current.revenue_dims?.[asked] ?? []
  const top = Math.max(1, ...list.map((r) => r.revenue ?? 0))
  const rows: CRow[] = list.map((r) => {
    const v = seen.get(r.value)
    return {
      key: r.value,
      a: asked === 'channel' ? channelLabel(r.value) : r.value || '(none)',
      bar: (r.revenue ?? 0) / top,
      mono: asked === 'entry_page',
      onPick: () => x.pick(asked, r.value),
      c: [fmtInt(r.customers ?? 0), x.money(r.revenue ?? 0), v && r.revenue !== undefined ? x.money(r.revenue / v) : ''],
    }
  })
  return (
    <>
      <XSub label={laterCopy.credit} attr="xcredit" value={first ? 'first' : 'last'} items={[{ key: 'last', label: laterCopy.closedIt }, { key: 'first', label: laterCopy.foundThem }]} onPick={(k) => onAttr(k === 'first')} />
      <XSub label={copy.heads.source} attr="xearn" value={asked} items={DIMS.map((d) => ({ key: d, label: dimName(d) }))} onPick={setAsked} />
      {rows.length === 0 ? <XEmpty title={laterCopy.noRevenue} hint={copy.emptyProductsHint} /> : <XCols first={dimName(asked)} cols={COLS} rows={rows} xc={XC} xcm={XCM} limit={x.limit} onAll={x.showAll} />}
    </>
  )
}

export function SalePages({ x, query }: { x: XCtx; query: ReportQuery }) {
  const key = `${x.site.id}|${query.from}|${query.to}|${query.attr ?? ''}|${query.testPayments ? 'test' : ''}|${JSON.stringify(query.filters ?? [])}`
  const [found, setFound] = useState<{ key: string; list: Row[] | null } | null>(null)
  useEffect(() => {
    let live = true
    extrasApi
      .pagesSell(x.site.id, query)
      .then((d) => live && setFound({ key, list: d.pages }))
      .catch(() => live && setFound({ key, list: null }))
    return () => {
      live = false
    }
    // Keyed by content: the query is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const here = found && found.key === key ? found : null
  if (here && !here.list) return <XEmpty title={extrasCopy.sells.failed} hint="" />
  const list = here?.list ?? []
  if (here && list.length === 0) return <XEmpty title={extrasCopy.sells.none} hint={extrasCopy.sells.note} />
  const top = Math.max(1, ...list.map((r) => r.revenue ?? 0))
  const rows: CRow[] = list.map((r) => ({ key: r.value, a: r.value || '/', bar: (r.revenue ?? 0) / top, mono: true, onPick: () => x.pick('page', r.value), c: [fmtInt(r.customers ?? 0), x.money(r.revenue ?? 0)] }))
  return (
    <>
      <XCols first={extrasCopy.sells.page} cols={[{ h: laterCopy.customers, hm: true }, { h: copy.heads.revenue }]} rows={rows} xc="minmax(0,1fr) 84px 84px" xcm="minmax(0,1fr) 72px" limit={x.limit} onAll={x.showAll} />
      <div className="xnote">{extrasCopy.sells.note}</div>
    </>
  )
}
