// AI & Search in the section's frame: the assistants that sent people, the crawlers that read the pages and each page's
// reads against the visitors sent; Google's searches are the Search section, one tap away.
import { lazy, Suspense, useEffect, useState } from 'react'
import { XEmpty, XError, XSec } from '../../../ui/XBits'
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
const SHORT = 6
const KINDS = [{ k: 'answer', color: 'var(--mk-lime)' }, { k: 'train', color: 'var(--ch-2)' }, { k: 'index', color: 'var(--ch-3)' }]

/** Google's own searches, a few lines: what showed the site and was clicked (all of them are in Search). */
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
  return (
    <>
      <XCols first={aiCopy.search} cols={[{ h: aiCopy.clicks }]} rows={rows} xc="minmax(0,1fr) 84px" limit={6} onAll={x.showAll} />
      <button type="button" className="mk-more" data-xsec="search" onClick={() => x.goTo('search')}>
        {aiCopy.seeSearch} {'›'}
      </button>
    </>
  )
}

export default function AiTab({ x }: { x: XCtx }) {
  const { rep, reload } = useAiSearch(x.site.id, x.query, ROWS)
  const [setup, setSetup] = useState(false)
  const [botRows, setBotRows] = useState(SHORT)
  const [pageRows, setPageRows] = useState(SHORT)
  // Live's "Set up" asks for the connect sheet; a mount that is kept takes the ask (one that React drops does not).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a one-time ask from outside React
    if (takeCrawlerSetupAsk() && can('site.settings')) setSetup(true)
  }, [])
  if (rep === undefined) return <Loading height={180} />
  if (rep === null) return <XError title={aiCopy.failed} onRetry={reload} />
  const people = rep.assistants.slice(0, ROWS)
  const top = Math.max(1, ...people.map((a) => a.visitors))
  const hit = Math.max(1, ...rep.bots.map((b) => b.hits))
  const crawlers: CRow[] = rep.bots.slice(0, ROWS).map((b) => ({ key: `${b.name}/${b.kind}`, a: `${b.name} · ${aiCopy.kind[b.kind] ?? b.kind}`, bar: b.hits / hit, c: [fmtInt(b.hits), <FailedCell blocked={b.blocked ?? 0} broken={b.errors ?? 0} />] }))
  const kinds = KINDS.map((k) => ({ ...k, n: rep.bots.filter((b) => b.kind === k.k).reduce((n, b) => n + b.hits, 0) })).filter((k) => k.n > 0)
  const pages = rep.pages.filter((p) => p.read > 0 || p.flag).slice(0, ROWS)
  const read = Math.max(1, ...pages.map((p) => p.read))
  const reads: CRow[] = pages.map((p) => ({ key: p.path, a: p.flag ? <>{p.path} <em className="xflag">{aiCopy.flag[p.flag]}</em></> : p.path, bar: p.read / read, mono: true, onPick: () => x.pick('page', p.path), c: [fmtInt(p.read), fmtInt(p.sent)] }))
  return (
    <>
      {hasAnswers() && (
        <Suspense fallback={null}>
          <AnswersLine x={x} />
        </Suspense>
      )}
      <div className="x2">
        <div>
          <XSec a={aiCopy.assistants} />
          {people.length === 0 ? (
            <XEmpty title={aiCopy.noAssistants} hint="" />
          ) : (
            <div className="xai-tiles">
              {people.slice(0, 4).map((p) => (
                <button key={p.name} type="button" className="xai-tile" disabled={!p.referrer} onClick={() => p.referrer && x.pick('referrer', p.referrer)}>
                  <span>{p.name}</span>
                  <b>{fmtInt(p.visitors)}</b>
                  <i><u style={{ width: `${(p.visitors / top) * 100}%` }} /></i>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <XSec a={aiCopy.google} />
          <GoogleLines x={x} />
        </div>
      </div>
      <XSec a={aiCopy.crawlers} b={fmtInt(rep.bots.reduce((n, b) => n + b.hits, 0))} />
      {crawlers.length === 0 ? (
        <XEmpty title={aiCopy.noAssistants} hint="">
          <button type="button" className="xb" onClick={() => setSetup(true)}>
            {aiCopy.setup}
          </button>
        </XEmpty>
      ) : (
        <>
        <div className="xsplit">
          <div className="xsplit-bar" aria-hidden="true">
            {kinds.map((k) => <i key={k.k} style={{ flexGrow: k.n, background: k.color }} />)}
          </div>
          <div className="xsplit-keys">
            {kinds.map((k) => <span key={k.k} className="xsplit-key"><i style={{ background: k.color }} aria-hidden="true" /><span>{aiCopy.kind[k.k] ?? k.k}</span><b>{fmtInt(k.n)}</b></span>)}
          </div>
        </div>
        <XCols first={aiCopy.crawler} cols={[{ h: aiCopy.hits }, { h: aiCopy.blockedHead }]} rows={crawlers} xc="minmax(0,1fr) 72px 120px" limit={botRows} onAll={() => setBotRows(ROWS)} />
        </>
      )}
      {reads.length > 0 && (
        <>
          <XSec a={aiCopy.pages} />
          <XCols first={aiCopy.page} cols={[{ h: copy.heads.read }, { h: copy.heads.sent }]} rows={reads} xc="minmax(0,1fr) 72px 72px" limit={pageRows} onAll={() => setPageRows(ROWS)} />
        </>
      )}
      {setup && (
        <Suspense fallback={null}>
          <CrawlerSetup site={x.site} onChanged={reload} onClose={() => setSetup(false)} />
        </Suspense>
      )}
    </>
  )
}
