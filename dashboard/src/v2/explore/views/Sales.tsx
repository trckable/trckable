// Sales: the net and its split by kind, then each sale with who it came from and what it earned, newest first.
import { XEmpty, XNote, XSec } from '../../ui/XBits'
import { fmtInt } from '../../../lib/format'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { Lock } from './Lock'
import { SourceChip } from '../../../features/verified/SourceChip'
import { SummaryCards } from '../../ui/SummaryCards'
import { XCols, type CRow } from '../../ui/XTable'
import { Flag } from '../../ui/Flag'
import { countryName } from '../../../lib/format'
import type { Sale, Sales as Model } from '../types'

const KINDS = ['new', 'upgrade', 'renewal', 'refund'] as const
const COLOR: Record<(typeof KINDS)[number], string> = { new: 'var(--mk-lime)', upgrade: 'var(--ch-2)', renewal: 'var(--ch-3)', refund: 'var(--mk-red)' }

/** The net as the headline, and one bar split by kind: each part filters the list, the picked part again clears it. */
function NetLabel({ x }: { x: XCtx }) {
  return (
    <>
      {x.kind ? copy.kinds[x.kind as Sale['kind']] : copy.sum.net} <SourceChip verified={x.site.verified} slot="revenue" />
    </>
  )
}

function Cards({ x, d }: { x: XCtx; d: Model }) {
  const total = d.sales.reduce((p, s) => p + s.amt, 0)
  const net = x.kind ? d.sales.filter((s) => s.kind === x.kind).reduce((p, s) => p + s.amt, 0) : total
  const items = [
    { key: 'net', icon: 'sales', label: <NetLabel x={x} />, val: x.money(net) },
    { key: 'orders', icon: 'cart', label: copy.sum.orders, val: fmtInt(d.orders) },
    { key: 'customers', icon: 'people', label: copy.sum.customers, val: fmtInt(d.customers) },
    ...(d.orders > 0 ? [{ key: 'avg', icon: 'overview', label: copy.sum.avg, val: x.money(Math.round((total + d.refunds) / d.orders)) }] : []),
    ...(d.refunds > 0 ? [{ key: 'refunds', icon: 'undo', label: copy.sum.refunds, val: x.money(d.refunds), tone: 'dn' as const }] : []),
  ]
  return <SummaryCards items={items} />
}

/** Where the money came from: the biggest countries by revenue (the server sends five), the unknown last, each with its share of the widest. */
function Countries({ x, list }: { x: XCtx; list: Model['countries'] }) {
  if (list.length === 0) return null
  const top = list
  const widest = Math.max(1, ...top.map((c) => c.amt))
  const rows: CRow[] = top.map((c) => ({
    key: c.code,
    a: c.code ? (
      <>
        <Flag code={c.code} /> {countryName(c.code)}
      </>
    ) : (
      copy.unknownPlace
    ),
    bar: c.amt / widest,
    onPick: c.code ? () => x.pick('country', c.code) : undefined,
    c: [x.money(c.amt)],
  }))
  return (
    <>
      <XSec a={copy.buyersFrom} />
      <XCols first={copy.heads.country} cols={[{ h: copy.heads.revenue }]} rows={rows} xc="minmax(0,1fr) 84px" xcm="minmax(0,1fr) 72px" limit={list.length} onAll={x.showAll} />
    </>
  )
}

/** One bar split by kind: each part filters the list, the picked part again clears it. */
function Split({ x, sales }: { x: XCtx; sales: Sale[] }) {
  const parts = KINDS.map((k) => ({ k, amt: sales.filter((s) => s.kind === k).reduce((p, s) => p + s.amt, 0) })).filter((p) => p.amt !== 0)
  const all = parts.reduce((p, s) => p + Math.abs(s.amt), 0) || 1
  return (
    <div className="xsplit">
      <div className="xsplit-bar" aria-hidden="true">
        {parts.map((p) => (
          <i key={p.k} className={x.kind && x.kind !== p.k ? 'off' : ''} style={{ flexGrow: Math.abs(p.amt) / all, background: COLOR[p.k] }} />
        ))}
      </div>
      <div className="xsplit-keys" role="group" aria-label={copy.kindLabel}>
        {parts.map((p) => (
          <button key={p.k} type="button" data-xkind={p.k} aria-pressed={x.kind === p.k} onClick={() => x.setKind(x.kind === p.k ? '' : p.k)}>
            <i style={{ background: COLOR[p.k] }} aria-hidden="true" />
            <span>{copy.kinds[p.k]}</span>
            <b>{x.money(p.amt)}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

function Line({ s, money }: { s: Sale; money: (minor: number) => string }) {
  return (
    <div className="sale">
      <span className={`mk-tag ${s.kind}`}>{copy.tags[s.kind]}</span>
      <span className="gn">
        <div>{s.label}</div>
        <div className="mk-quiet" style={{ fontSize: '12px' }}>
          {[s.from, s.country, s.device, s.when].filter(Boolean).join(' · ')}
        </div>
      </span>
      <span className={`amt ${s.amt < 0 ? 'neg' : ''}`}>
        {s.amt < 0 ? '' : '+'}
        {money(s.amt)}
      </span>
    </div>
  )
}

export function Sales({ x, d }: { x: XCtx; d: Model }) {
  if (d.state === 'connect') return <Lock k="rev" x={x} />
  if (d.state === 'none')
    return (
      <>
        <XEmpty title={copy.emptyProducts} hint={copy.emptyProductsHint}>
          {x.widen && (
            <button type="button" className="xb" onClick={x.widen}>
              {copy.widen}
            </button>
          )}
        </XEmpty>
        <XNote>
          <SourceChip verified={x.site.verified} slot="revenue" />
        </XNote>
      </>
    )
  const list = d.sales.filter((s) => !x.kind || s.kind === x.kind)
  // One line a kind says what the split already says.
  const same = d.sales.length === new Set(d.sales.map((s) => s.kind)).size
  const lines = same ? null : list.slice(0, x.limit).map((s, i) => <Line key={`${i}${s.when}`} s={s} money={x.money} />)
  return (
    <>
      <Cards x={x} d={d} />
      <Split x={x} sales={d.sales} />
      <Countries x={x} list={d.countries} />
      {list.length === 0 ? (
        <XEmpty title={copy.emptyKind} hint={copy.emptyKindHint}>
          {x.kind && (
            <button type="button" className="xb" data-xkind="" onClick={() => x.setKind('')}>
              {copy.showAllSales}
            </button>
          )}
        </XEmpty>
      ) : (
        lines
      )}
      {list.length > x.limit && (
        <button type="button" className="mk-more" id="xMore" onClick={x.showAll}>
          {copy.showAll(list.length)}
        </button>
      )}
    </>
  )
}
