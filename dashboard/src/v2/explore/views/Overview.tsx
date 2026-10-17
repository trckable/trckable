// Overview: the four numbers, the shape of the period, any downtime, and the top pages and sources.
import { valueOf } from '../filters'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Overview as Model } from '../types'
import { XSec } from '../../ui/XBits'
import { XKcs } from '../../ui/XKcs'
import { XShape } from '../../ui/XShape'
import { PeopleTable } from './PeopleTable'

export function Overview({ x, d }: { x: XCtx; d: Model }) {
  return (
    <>
      <XKcs items={d.kcs} />
      <XSec a={copy.shape} b={copy.per(d.per)} />
      {d.shape ? (
        <XShape shape={d.shape} />
      ) : (
        <div className="mk-quiet" style={{ padding: '8px 0' }}>
          {copy.notEnough}
        </div>
      )}
      <XSec a={copy.downtime} b={d.down.length ? copy.incidents(d.down.length) : copy.none} />
      {d.down.map((i) => (
        <div key={i.from} className="sale">
          <span className="mk-tag refund">{copy.down}</span>
          <span className="gn">{copy.downSpan(i.from, i.to)}</span>
          <span className="amt">{copy.minutes(i.min)}</span>
        </div>
      ))}
      <div className="x2">
        <div>
          <XSec a={copy.topPages} b={copy.tapFilter} />
          <PeopleTable x={x} rows={d.pages} head={copy.heads.page} mono selected={valueOf(x.filters, 'page')} onPick={(r) => x.pick('page', r.val)} dim="page" limit={5} onAll={x.showAll} go={{ label: copy.showAllPages, section: 'pages', run: () => x.goTo('pages') }} />
        </div>
        <div>
          <XSec a={copy.topSources} />
          <PeopleTable x={x} rows={d.sources} head={copy.heads.source} selected={valueOf(x.filters, 'referrer')} onPick={(r) => x.pick('referrer', r.val)} dim="referrer" limit={5} onAll={x.showAll} go={{ label: copy.showAllSources, section: 'sources', run: () => x.goTo('sources') }} />
        </div>
      </div>
    </>
  )
}
