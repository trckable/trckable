// Overview: the four numbers, the shape of the period, the top pages and sources, and downtime when there was some.
import { valueOf } from '../filters'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Overview as Model } from '../types'
import { Waiting } from '../../ui/Waiting'
import { XSec } from '../../ui/XBits'
import { XKcs, XKcsPlain } from '../../ui/XKcs'
import { XShape } from '../../ui/XShape'
import { PeopleTable } from './PeopleTable'
import { rowWords } from '../pointer'
import { rowMark } from '../rowMarks'

export function Overview({ x, d }: { x: XCtx; d: Model }) {
  if (!x.site.last_event_at && d.of === 0 && x.filters.length === 0) return <Waiting site={x.site} />
  return (
    <>
      <XKcs items={d.kcs} />
      <XKcsPlain items={d.visits} />
      <XSec a={copy.shape} b={copy.per(d.per)} />
      {d.shape ? (
        <XShape shape={d.shape} />
      ) : (
        <div className="mk-quiet" style={{ padding: '8px 0' }}>
          {copy.notEnough}
        </div>
      )}
      <div className="x2">
        <div>
          <XSec a={copy.topPages} b={rowWords().filter} />
          <PeopleTable x={x} rows={d.pages} head={copy.heads.page} mono mark={(r) => rowMark('pages', r)} selected={valueOf(x.filters, 'page')} onPick={(r) => x.pick('page', r.val)} dim="page" limit={5} of={d.of} onAll={x.showAll} go={{ label: copy.showAllPages, section: 'pages', run: () => x.goTo('pages') }} />
        </div>
        <div>
          <XSec a={copy.topSources} />
          <PeopleTable x={x} rows={d.sources} head={copy.heads.source} mark={(r) => rowMark('sources', r)} selected={valueOf(x.filters, 'channel')} onPick={(r) => x.pick('channel', r.val)} dim="channel" limit={5} of={d.of} onAll={x.showAll} go={{ label: copy.showAllSources, section: 'sources', run: () => x.goTo('sources') }} />
        </div>
      </div>
    </>
  )
}
