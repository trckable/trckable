// Search: what Google says about the site, the four numbers and the queries (or pages) behind them.
import { fmtInt } from '../../../lib/format'
import { XEmpty, XNote, XSetup, XSub } from '../../ui/XBits'
import { XKcsPlain } from '../../ui/XKcs'
import { XCols, type CRow } from '../../ui/XTable'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Search as Model, SearchRow } from '../types'
import { fmtK, pct1 } from './numbers'

const cols = [{ h: copy.heads.clicks }, { h: copy.impr, hm: true }, { h: copy.ctr, hm: true }, { h: copy.pos }]

function rowsOf(list: SearchRow[], mono: boolean): CRow[] {
  const max = Math.max(1, ...list.map((r) => r.clicks))
  return list.map((r) => ({
    key: r.name,
    a: (
      <>
        {r.name}
        {r.fresh && (
          <>
            {' '}
            <em className="newq">{copy.fresh}</em>
          </>
        )}
      </>
    ),
    bar: r.clicks / max,
    mono,
    c: [fmtInt(r.clicks), fmtK(r.impr), pct1(r.ctr), r.pos.toFixed(1)],
  }))
}

export function Search({ x, d }: { x: XCtx; d: Model }) {
  if (!d.on) return <XSetup icon="search" x={copy.setup.search} howLabel={copy.howWorks} onSet={() => x.connect('search')} onHow={() => x.how('search')} />
  if (!d.enough) return <XEmpty title={copy.emptySearch} hint={copy.emptySearchHint} />
  const q = x.sdim === 'q'
  return (
    <>
      <XKcsPlain items={d.kcs} />
      <XSub
        label={copy.searchBy}
        attr="xsdim"
        value={x.sdim}
        items={[
          { key: 'q', label: copy.queries },
          { key: 'p', label: copy.pagesTab },
        ]}
        onPick={x.setSdim}
      />
      <XCols first={q ? copy.query : copy.heads.page} cols={cols} rows={rowsOf(q ? d.queries : d.pages, !q)} xc="minmax(0,1fr) 64px 64px 56px 48px" xcm="minmax(0,1fr) 56px 44px" limit={x.limit} onAll={x.showAll} />
      <XNote>{copy.noteSearch}</XNote>
    </>
  )
}
