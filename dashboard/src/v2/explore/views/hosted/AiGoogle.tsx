// Google's own searches in AI & Search, a few lines: what showed the site and was clicked (all of them are in Search).
import { useEffect, useState } from 'react'
import { XEmpty } from '../../../ui/XBits'
import { XCols, type CRow } from '../../../ui/XTable'
import { fmtInt } from '../../../../lib/format'
import { messageOf, more, type SearchReport } from '../../../../lib/apiMore'
import { aiCopy } from '../../../../features/aisearch/copy'
import type { XCtx } from '../../ctx'

export function GoogleLines({ x }: { x: XCtx }) {
  const [rep, setRep] = useState<SearchReport | null | 'off'>(null)
  const key = JSON.stringify([x.site.id, x.query.from, x.query.to, x.query.filters])
  useEffect(() => {
    const ac = new AbortController()
    more
      .searchConsole(x.site.id)
      .then((c): Promise<SearchReport | 'off'> => (c.connected ? more.searchReport(x.site.id, x.query, 'query', ac.signal) : Promise.resolve('off' as const)))
      .then(setRep)
      .catch((e: unknown) => !ac.signal.aborted && setRep(/not connected|module is off/i.test(messageOf(e)) ? 'off' : null))
    return () => ac.abort()
    // Keyed by content: the query is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (rep === 'off') {
    return (
      <XEmpty title={aiCopy.connectLabel} hint={aiCopy.connectHint}>
        <button type="button" className="xb" onClick={() => x.connect('search')}>
          {aiCopy.connect}
        </button>
      </XEmpty>
    )
  }
  if (!rep) return null
  const list = (rep.rows ?? []).slice(0, 6)
  if (list.length === 0) return <XEmpty title={aiCopy.noGoogle} hint="" />
  const top = Math.max(1, ...list.map((r) => r.clicks))
  const rows: CRow[] = list.map((r) => ({ key: r.key, a: r.key, bar: r.clicks / top, c: [fmtInt(r.clicks)] }))
  return (
    <>
      <XCols first={aiCopy.search} cols={[{ h: aiCopy.clicks }]} rows={rows} xc="minmax(0,1fr) 84px" limit={6} onAll={x.showAll} />
      <button type="button" className="mk-more" data-xsec="search" onClick={() => x.goTo('search')}>
        {aiCopy.seeSearch} {'›'}
      </button>
    </>
  )
}
