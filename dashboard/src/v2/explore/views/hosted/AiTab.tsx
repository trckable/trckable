// AI & Search in the section's frame: the assistants that sent people, the crawlers that read the pages and each page's
// reads against the visitors sent; Google's searches are the Search tab of Sources, one tap away.
import { lazy, Suspense, useEffect, useState } from 'react'
import { XEmpty, XError, XNote, XSec } from '../../../ui/XBits'
import { XCols, type CRow } from '../../../ui/XTable'
import { Loading } from '../../../../components/loading/Loading'
import { fmtInt } from '../../../../lib/format'
import { messageOf, more, type SearchReport } from '../../../../lib/apiMore'
import { aiCopy } from '../../../../features/aisearch/copy'
import { FailedCell } from '../../../../features/aisearch/FailedCell'
import { useAiSearch } from '../../../../features/aisearch/useAiSearch'
import { takeCrawlerSetupAsk } from '../../../../features/crawlers/ask'
import { can } from '../../../../lib/permissions'
import { hasAnswers } from '../../../../lib/me'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'

const CrawlerSetup = lazy(() => import('../../../../features/crawlers/CrawlerSetup').then((m) => ({ default: m.CrawlerSetup })))
const AnswersLine = lazy(() => import('../../../../features/answers/AnswersLine').then((m) => ({ default: m.AnswersLine })))
const ROWS = 12

/** Google's own searches, a few lines: what showed the site and was clicked (all of them are in Sources, Search). */
function GoogleLines({ x }: { x: XCtx }) {
  const [rep, setRep] = useState<SearchReport | null | 'off'>(null)
  const key = JSON.stringify([x.site.id, x.query.from, x.query.to, x.query.filters])
  useEffect(() => {
    const ac = new AbortController()
    more
      .searchReport(x.site.id, x.query, 'query', ac.signal)
      .then(setRep)
      .catch((e: unknown) => !ac.signal.aborted && setRep(/not connected|module is off/i.test(messageOf(e)) ? 'off' : null))
    return () => ac.abort()
    // Keyed by content: the query is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (rep === 'off') {
    return (
      <XEmpty title={aiCopy.connectLabel} hint="">
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
  return <XCols first={aiCopy.search} cols={[{ h: aiCopy.clicks }]} rows={rows} xc="minmax(0,1fr) 84px" limit={6} onAll={x.showAll} />
}

export default function AiTab({ x }: { x: XCtx }) {
  const { rep, reload } = useAiSearch(x.site.id, x.query, ROWS)
  const [setup, setSetup] = useState(false)
  // Live's "Set up" asks for the connect sheet; a mount that is kept takes the ask (one that React drops does not).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a one-time ask from outside React
    if (takeCrawlerSetupAsk() && can('site.settings')) setSetup(true)
  }, [])
  if (rep === undefined) return <Loading height={180} />
  if (rep === null) return <XError title={aiCopy.failed} onRetry={reload} />
  const people = rep.assistants.slice(0, ROWS)
  const top = Math.max(1, ...people.map((a) => a.visitors))
  const assistants: CRow[] = people.map((a) => {
    const host = a.referrer
    return { key: a.name, a: a.name, bar: a.visitors / top, onPick: host ? () => x.pick('referrer', host) : undefined, c: [fmtInt(a.visitors)] }
  })
  const hit = Math.max(1, ...rep.bots.map((b) => b.hits))
  const crawlers: CRow[] = rep.bots.slice(0, ROWS).map((b) => ({ key: `${b.name}/${b.kind}`, a: `${b.name} · ${aiCopy.kind[b.kind] ?? b.kind}`, bar: b.hits / hit, c: [fmtInt(b.hits), <FailedCell blocked={b.blocked ?? 0} broken={b.errors ?? 0} />] }))
  const pages = rep.pages.filter((p) => p.read > 0 || p.flag).slice(0, ROWS)
  const read = Math.max(1, ...pages.map((p) => p.read))
  const reads: CRow[] = pages.map((p) => ({ key: p.path, a: p.flag ? `${p.path} · ${aiCopy.flag[p.flag]}` : p.path, bar: p.read / read, mono: true, onPick: () => x.pick('page', p.path), c: [fmtInt(p.read), fmtInt(p.sent)] }))
  return (
    <>
      {hasAnswers() && (
        <Suspense fallback={null}>
          <AnswersLine x={x} />
        </Suspense>
      )}
      <XSec a={aiCopy.google}  />
      <GoogleLines x={x} />
      <XSec a={aiCopy.assistants} b={fmtInt(people.reduce((n, a) => n + a.visitors, 0))} />
      {assistants.length === 0 ? <XEmpty title={aiCopy.noAssistants} hint="" /> : <XCols first={aiCopy.assistant} cols={[{ h: aiCopy.visitors }]} rows={assistants} xc="minmax(0,1fr) 84px" limit={x.limit} onAll={x.showAll} />}
      <XSec a={aiCopy.crawlers} b={fmtInt(rep.crawled)} />
      {crawlers.length === 0 ? (
        <XEmpty title={aiCopy.noAssistants} hint="">
          <button type="button" className="xb" onClick={() => setSetup(true)}>
            {aiCopy.setup}
          </button>
        </XEmpty>
      ) : (
        <XCols first={aiCopy.crawler} cols={[{ h: aiCopy.hits }, { h: aiCopy.blockedHead }]} rows={crawlers} xc="minmax(0,1fr) 72px 120px" limit={x.limit} onAll={x.showAll} />
      )}
      {reads.length > 0 && (
        <>
          <XSec a={aiCopy.pages} />
          <XCols first={aiCopy.page} cols={[{ h: copy.heads.read }, { h: copy.heads.sent }]} rows={reads} xc="minmax(0,1fr) 72px 72px" limit={x.limit} onAll={x.showAll} />
        </>
      )}
      <XNote>
        <button type="button" className="xb" onClick={() => x.goTo('search')}>
          {aiCopy.search} {'›'}
        </button>
      </XNote>
      {setup && (
        <Suspense fallback={null}>
          <CrawlerSetup site={x.site} onChanged={reload} onClose={() => setSetup(false)} />
        </Suspense>
      )}
    </>
  )
}
