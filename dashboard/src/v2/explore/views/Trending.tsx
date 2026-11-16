// What changed: pages and sources, each as Top, Trending up and Trending down, five rows and a way to the whole table.
import { useState } from 'react'
import { fmtInt } from '../../../lib/format'
import type { Row as ApiRow } from '../../../lib/api'
import { listOf, MIN_COUNT, type Item, type Kind } from '../../why/trending'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { rowMark } from '../rowMarks'
import type { Tab } from '../types'

const KINDS: Kind[] = ['top', 'up', 'down']
const label = (k: Kind) => ({ top: copy.trendTop, up: copy.trendUp, down: copy.trendDown })[k]
const host = (v: string) => v.replace(/^www\./, '')

interface Spec {
  tab: Tab
  dim: string
  title: string
  all: string
  name: (v: string) => string
}

type Dims = { dims: Record<string, ApiRow[] | null> }

function Change({ i }: { i: Item }) {
  if (i.fresh) return <span className="xtr-d up">{copy.trendNew}</span>
  if (i.pct === null) return <span className="xtr-d" />
  const p = Math.round(i.pct)
  if (p === 0) return <span className="xtr-d">0%</span>
  return <span className={`xtr-d ${p > 0 ? 'up' : 'dn'}`}>{`${p > 0 ? '↑' : '↓'} ${Math.abs(p)}%`}</span>
}

function List({ spec, x, cur, prev }: { spec: Spec; x: XCtx; cur: ApiRow[] | null | undefined; prev: ApiRow[] | null | undefined }) {
  const [kind, setKind] = useState<Kind>('top')
  const items = listOf(kind, cur, prev)
  return (
    <section className="xtr" data-trend={spec.dim}>
      <div className="xtr-head">
        <h3>{spec.title}</h3>
        <span className="xchg-kinds" role="tablist" aria-label={spec.title}>
          {KINDS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === kind} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{label(k)}</button>
          ))}
        </span>
      </div>
      {items.length === 0 && <div className="mk-quiet">{kind === 'top' ? copy.trendNone : copy.trendNoneMoved(MIN_COUNT)}</div>}
      {items.map((i) => (
        <button key={i.value} type="button" className="xtr-row" title={`${spec.name(i.value)}: ${fmtInt(i.was)} → ${fmtInt(i.now)}`} onClick={() => i.value && x.goWith(spec.tab, spec.dim, i.value)}>
          <span className="xtr-mark">{rowMark(spec.tab, { val: i.value, name: spec.name(i.value), v: i.now, c: i.was, st: '' })}</span>
          <span className="xtr-name">{spec.name(i.value)}</span>
          <Change i={i} />
          <b className="xtr-n">{fmtInt(i.now)}</b>
        </button>
      ))}
      <button type="button" className="mk-more" onClick={() => x.goTo(spec.tab)}>{`${copy.trendMore(spec.all)} ›`}</button>
    </section>
  )
}

/** The pages and the sources that lead, rise and fall: the report's current and previous breakdowns, nothing more is asked. */
export function Trending({ x, cur, prev }: { x: XCtx; cur: Dims; prev?: Dims }) {
  const pages: Spec = { tab: 'pages', dim: 'page', title: copy.trendPages, all: copy.trendAllPages, name: (v) => v }
  const sources: Spec = { tab: 'referrers', dim: 'referrer', title: copy.trendSources, all: copy.trendAllSources, name: (v) => host(v) || copy.direct }
  return (
    <div className="xtr-grid">
      <List spec={pages} x={x} cur={cur.dims.page} prev={prev?.dims.page} />
      <List spec={sources} x={x} cur={cur.dims.referrer} prev={prev?.dims.referrer} />
    </div>
  )
}
