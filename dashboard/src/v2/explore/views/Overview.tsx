// Overview: the four numbers, the shape of the period, downtime when there was some, and the top pages and sources.
import { valueOf } from '../filters'
import { copy } from '../copy'
import type { XCtx } from '../ctx'
import type { Overview as Model } from '../types'
import { XSec } from '../../ui/XBits'
import { XKcs } from '../../ui/XKcs'
import { XShape } from '../../ui/XShape'
import { Downtime } from './Downtime'
import { PeopleTable } from './PeopleTable'
import { rowWords } from '../pointer'

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
      <Downtime down={d.down} />
      <div className="x2">
        <div>
          <XSec a={copy.topPages} b={rowWords().filter} />
          <PeopleTable x={x} rows={d.pages} head={copy.heads.page} mono selected={valueOf(x.filters, 'page')} onPick={(r) => x.pick('page', r.val)} dim="page" limit={5} onAll={x.showAll} go={{ label: copy.showAllPages, section: 'pages', run: () => x.goTo('pages') }} />
        </div>
        <div>
          <XSec a={copy.topSources} />
          <PeopleTable x={x} rows={d.sources} head={copy.heads.source} selected={valueOf(x.filters, 'channel')} onPick={(r) => x.pick('channel', r.val)} dim="channel" limit={5} onAll={x.showAll} go={{ label: copy.showAllSources, section: 'sources', run: () => x.goTo('sources') }} />
        </div>
      </div>
    </>
  )
}
