// AI & Search in the section's frame: the headline (what AI reads against the people who come), each assistant's reads
// against the visitors it sent, what to improve, then the detail: the one table of robots and each page's reads.
import { lazy, Suspense, useEffect, useState } from 'react'
import { XEmpty, XError, XNote, XSec } from '../../../ui/XBits'
import { XCols, type CRow } from '../../../ui/XTable'
import { Loading } from '../../../../components/loading/Loading'
import { fmtInt } from '../../../../lib/format'
import { aiCopy } from '../../../../features/aisearch/copy'
import { FailedCell } from '../../../../features/aisearch/FailedCell'
import { useAiSearch } from '../../../../features/aisearch/useAiSearch'
import { takeCrawlerSetupAsk } from '../../../../features/crawlers/ask'
import { can } from '../../../../lib/permissions'
import { cachedReport } from '../../../../lib/api'
import { copy } from '../../copy'
import type { XCtx } from '../../ctx'
import { AiAssistants } from './AiAssistants'
import { AiHeadline } from './AiHeadline'
import { AiTips } from './AiTips'
import { tipsOf } from './aiTipsOf'

const CrawlerSetup = lazy(() => import('../../../../features/crawlers/CrawlerSetup').then((m) => ({ default: m.CrawlerSetup })))
const ROWS = 12
const SHORT = 6
const KINDS = [{ k: 'answer', color: 'var(--mk-lime)' }, { k: 'train', color: 'var(--ch-2)' }, { k: 'index', color: 'var(--ch-3)' }]

// The page's own window only: scrollIntoView would also move a page this one is embedded in.
const toSection = (id: string) => {
  const el = document.getElementById(id)
  if (el) scrollTo({ top: Math.max(0, scrollY + el.getBoundingClientRect().top - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0)), behavior: 'smooth' })
}

export default function AiTab({ x }: { x: XCtx }) {
  const { rep, reload } = useAiSearch(x.site.id, x.query, ROWS)
  const [setup, setSetup] = useState(false)
  const [botRows, setBotRows] = useState(SHORT)
  const [pageRows, setPageRows] = useState(SHORT)
  // What was dropped on purpose besides robots comes with the period's report (absent under a filter).
  const [dropped, setDropped] = useState<{ left: number; aged: number }>({ left: 0, aged: 0 })
  const dropKey = JSON.stringify([x.site.id, x.query.from, x.query.to, x.query.filters ?? []])
  useEffect(() => {
    const ac = new AbortController()
    cachedReport(x.site.id, x.query, undefined, ac.signal).then((r) => setDropped({ left: r.bots?.kinds?.owner ?? 0, aged: r.bots?.kinds?.aged ?? 0 }), () => undefined)
    return () => ac.abort()
  }, [dropKey]) // eslint-disable-line react-hooks/exhaustive-deps -- dropKey is the request's content; query is a new object each render
  // Live's "Set up" asks for the connect sheet; a mount that is kept takes the ask (one that React drops does not).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a one-time ask from outside React
    if (takeCrawlerSetupAsk() && can('site.settings')) setSetup(true)
  }, [])
  if (rep === undefined) return <Loading height={180} />
  if (rep === null) return <XError title={aiCopy.failed} onRetry={reload} />
  const filtered = x.filters.length > 0
  const hit = Math.max(1, ...rep.bots.map((b) => b.hits))
  const crawlers: CRow[] = rep.bots.slice(0, ROWS).map((b) => ({ key: `${b.name}/${b.kind}`, a: `${b.name} · ${aiCopy.kind[b.kind] ?? b.kind}`, bar: b.hits / hit, c: [fmtInt(b.hits), <FailedCell blocked={b.blocked ?? 0} broken={b.errors ?? 0} />] }))
  const kinds = KINDS.map((k) => ({ ...k, n: rep.bots.filter((b) => b.kind === k.k).reduce((n, b) => n + b.hits, 0) })).filter((k) => k.n > 0)
  const pages = [...rep.pages].filter((p) => p.read > 0 || p.flag).sort((a, b) => b.read - a.read).slice(0, ROWS)
  const read = Math.max(1, ...pages.map((p) => p.read))
  const reads: CRow[] = pages.map((p) => ({ key: p.path, a: p.flag ? <>{p.path} <em className="xflag">{aiCopy.flag[p.flag]}</em></> : p.path, bar: p.read / read, mono: true, onPick: () => x.pick('page', p.path), c: [fmtInt(p.read), fmtInt(p.sent)] }))
  return (
    <>
      <AiHeadline rep={rep} filtered={filtered} />
      <AiAssistants rep={rep} x={x} filtered={filtered} />
      <AiTips tips={tipsOf(rep, can('site.settings'), filtered)} go={{ connect: () => setSetup(true), page: (p) => x.pick('page', p), section: toSection }} />
      <XSec id="crawlers" a={aiCopy.crawlers} b={fmtInt(rep.bots.reduce((n, b) => n + b.hits, 0))} />
      <XNote>{aiCopy.whyBots}</XNote>
      {crawlers.length === 0 ? (
        <XEmpty title={aiCopy.noAssistants} hint={aiCopy.setupHint}>
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
      {(dropped.left > 0 || dropped.aged > 0) && <XNote>{[dropped.left ? copy.leftOut(fmtInt(dropped.left)) : '', dropped.aged ? copy.tooOld(fmtInt(dropped.aged)) : ''].filter(Boolean).join(' · ')}</XNote>}
      {reads.length > 0 && (
        <>
          <XSec id="pages" a={aiCopy.pages} />
          <XNote>{aiCopy.whyPages}</XNote>
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
