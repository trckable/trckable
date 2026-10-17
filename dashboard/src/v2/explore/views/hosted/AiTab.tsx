// AI & Search in the section's frame: the assistants that sent people, the crawlers that read the pages and each page's
// reads against the visitors sent; Google's searches are the Search tab of Sources, one tap away.
import { lazy, Suspense, useState } from 'react'
import { XEmpty, XNote, XSec } from '../../../ui/XBits'
import { XCols, type CRow } from '../../../ui/XTable'
import { Loading } from '../../../../components/loading/Loading'
import { fmtInt } from '../../../../lib/format'
import { byAssistant } from '../../../../features/extras/assistants'
import { aiCopy } from '../../../../features/aisearch/copy'
import { useAiSearch } from '../../../../features/aisearch/useAiSearch'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'

const CrawlerSetup = lazy(() => import('../../../../features/crawlers/CrawlerSetup').then((m) => ({ default: m.CrawlerSetup })))
const ROWS = 12

export default function AiTab({ x }: { x: XCtx }) {
  const { rep, reload } = useAiSearch(x.site.id, x.query, ROWS)
  const [setup, setSetup] = useState(false)
  if (rep === undefined) return <Loading height={180} />
  if (rep === null) return <XEmpty title={aiCopy.failed} hint="" />
  const people = byAssistant(rep.referrers.map((r) => ({ value: r.value, visitors: r.visitors }))).slice(0, ROWS)
  const top = Math.max(1, ...people.map((a) => a.visitors))
  const assistants: CRow[] = people.map((a) => ({ key: a.referrer, a: a.name, bar: a.visitors / top, onPick: () => x.pick('referrer', a.referrer), c: [fmtInt(a.visitors)] }))
  const hit = Math.max(1, ...rep.bots.map((b) => b.hits))
  const crawlers: CRow[] = rep.bots.slice(0, ROWS).map((b) => ({ key: `${b.name}/${b.kind}`, a: `${b.name} · ${aiCopy.kind[b.kind] ?? b.kind}`, bar: b.hits / hit, c: [fmtInt(b.hits)] }))
  const pages = rep.pages.filter((p) => p.read > 0 || p.flag).slice(0, ROWS)
  const read = Math.max(1, ...pages.map((p) => p.read))
  const reads: CRow[] = pages.map((p) => ({ key: p.path, a: p.flag ? `${p.path} · ${aiCopy.flag[p.flag]}` : p.path, bar: p.read / read, mono: true, onPick: () => x.pick('page', p.path), c: [fmtInt(p.read), fmtInt(p.sent)] }))
  return (
    <>
      <XSec a={aiCopy.assistants} b={fmtInt(rep.visitors)} />
      {assistants.length === 0 ? <XEmpty title={aiCopy.noAssistants} hint="" /> : <XCols first={aiCopy.assistant} cols={[{ h: aiCopy.visitors }]} rows={assistants} xc="minmax(0,1fr) 84px" limit={x.limit} onAll={x.showAll} />}
      <XSec a={aiCopy.crawlers} b={fmtInt(rep.crawled)} />
      {crawlers.length === 0 ? (
        <XEmpty title={aiCopy.noAssistants} hint="">
          <button type="button" className="xb" onClick={() => setSetup(true)}>
            {aiCopy.setup}
          </button>
        </XEmpty>
      ) : (
        <XCols first={aiCopy.crawler} cols={[{ h: aiCopy.hits }]} rows={crawlers} xc="minmax(0,1fr) 84px" limit={x.limit} onAll={x.showAll} />
      )}
      {reads.length > 0 && (
        <>
          <XSec a={aiCopy.pages} />
          <XCols first={aiCopy.page} cols={[{ h: copy.heads.read }, { h: copy.heads.sent }]} rows={reads} xc="minmax(0,1fr) 72px 72px" limit={x.limit} onAll={x.showAll} />
        </>
      )}
      <XNote>
        <button type="button" className="xb" onClick={() => x.goTo('search')}>
          {aiCopy.google} {'›'}
        </button>
      </XNote>
      {setup && (
        <Suspense fallback={null}>
          <CrawlerSetup site={x.site} on={rep.crawlers} onChanged={reload} onClose={() => setSetup(false)} />
        </Suspense>
      )}
    </>
  )
}
