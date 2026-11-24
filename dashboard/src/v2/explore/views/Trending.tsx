// What changed: where people came from and what they looked at, each the top rows with their change against the period before.
import { fmtInt } from '../../../lib/format'
import type { Row as ApiRow } from '../../../lib/api'
import { itemsOf, topOf, type Item } from '../../why/trending'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import { isGoogle, type Path } from '../googlePath'
import { rowMark } from '../rowMarks'
import type { Tab } from '../types'
import { BriefCard } from './BriefCard'

const host = (v: string) => v.replace(/^www\./, '')
const SOURCES = 4
const PAGES = 5

type Dims = { dims: Record<string, ApiRow[] | null> }

function Change({ i }: { i: Item }) {
  if (i.fresh) return <span className="xtr-d up">{copy.trendNew}</span>
  if (i.pct === null) return <span className="xtr-d" />
  const p = Math.round(i.pct)
  if (p === 0) return <span className="xtr-d">0%</span>
  return <span className={`xtr-d ${p > 0 ? 'up' : 'dn'}`}>{`${p > 0 ? '↑' : '↓'} ${Math.abs(p)}%`}</span>
}

function Line({ tab, dim, name, i, x }: { tab: Tab; dim: string; name: string; i: Item; x: XCtx }) {
  return (
    <button type="button" className="xtr-row" title={`${name}: ${fmtInt(i.was)} → ${fmtInt(i.now)}`} onClick={() => i.value && x.goWith(tab, dim, i.value)}>
      <span className="xtr-mark">{rowMark(tab, { val: i.value, name, v: i.now, c: i.was, st: '' })}</span>
      {i.title ? <span className="xtr-name xtr-titled"><b>{i.title}</b><small>{i.value}</small></span> : <span className="xtr-name">{name}</span>}
      <Change i={i} />
      <b className="xtr-n">{fmtInt(i.now)}</b>
    </button>
  )
}

/** Google's row where Search Console is connected: who we saw, and the path that led to them (what Google showed, what was clicked). */
function GoogleInset({ i, path, x }: { i: Item; path: Path; x: XCtx }) {
  return (
    <div className="xbr-g" data-google="path">
      <button type="button" className="xtr-row" onClick={() => x.goWith('sources', 'referrer', i.value)}>
        <span className="xtr-mark">{rowMark('sources', { val: i.value, name: host(i.value), v: i.now, c: i.was, st: '' })}</span>
        <span className="xtr-name">{copy.googlePeople(fmtInt(path.arrived))}</span>
        <Change i={i} />
      </button>
      <p className="xbr-g-path">
        {copy.googleShown} <b>{fmtInt(path.shown)}</b> → {copy.googleClicked} <b>{fmtInt(path.clicked)}</b> → {copy.googleArrived} <b>{fmtInt(path.arrived)}</b>
      </p>
      <p className="xbr-g-note">{copy.googleNote}</p>
    </div>
  )
}

/** Where Search Console is connected Google is always the first row, even when it is not among the biggest sources; the others follow. */
export function SourcesCard({ x, cur, prev, google }: { x: XCtx; cur: Dims; prev?: Dims; google: Path | null }) {
  const first = google ? itemsOf(cur.dims.referrer, prev?.dims.referrer).find((i) => isGoogle(i.value)) ?? { value: 'google.com', now: 0, was: 0, pct: null, fresh: false } : null
  const rest = topOf(cur.dims.referrer, prev?.dims.referrer, 100).filter((i) => !google || !isGoogle(i.value)).slice(0, google ? SOURCES - 1 : SOURCES)
  return (
    <BriefCard id="sources" title={copy.cardSources}>
      {!first && rest.length === 0 && <div className="mk-quiet">{copy.trendNone}</div>}
      {first && google && <GoogleInset i={first} path={google} x={x} />}
      {rest.map((i) => (
        <Line key={i.value} tab="sources" dim="referrer" name={host(i.value) || copy.direct} i={i} x={x} />
      ))}
    </BriefCard>
  )
}

export function PagesCard({ x, cur, prev }: { x: XCtx; cur: Dims; prev?: Dims }) {
  const items = topOf(cur.dims.page, prev?.dims.page, PAGES)
  return (
    <BriefCard id="pages" title={copy.cardPages}>
      {items.length === 0 && <div className="mk-quiet">{copy.trendNone}</div>}
      {items.map((i) => (
        <Line key={i.value} tab="pages" dim="page" name={i.value === '/' ? copy.homePage : i.value} i={i} x={x} />
      ))}
      <button type="button" className="mk-more" onClick={() => x.goTo('pages')}>{`${copy.allPagesInExplore} ›`}</button>
    </BriefCard>
  )
}
