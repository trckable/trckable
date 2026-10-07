// Who reads the site, and what for. Robots do not run JavaScript, so these
// hits come from the site's own server; the card splits them three ways —
// an AI assistant fetching for someone now, a crawler collecting training
// data, or a search bot indexing.
import { useEffect, useMemo, useState } from 'react'
import { type CrawlerReport, type ReportQuery, type Site, more } from '../../lib/apiMore'
import { fmtInt } from '../../lib/format'
import { Loading } from '../../components/loading/Loading'
import { Card } from '../../kit'
import { CrawlerChart } from './CrawlerChart'
import { CrawlerList } from './CrawlerList'
import { CrawlerReads } from './CrawlerReads'
import { CrawlerSetup } from './CrawlerSetup'
import { copy, KINDS, type CrawlKind } from './copy'
import { Info } from '../../components/Info'
import './Crawlers.css'

const toggled = (set: Set<string>, name: string) => {
  const next = new Set(set)
  if (!next.delete(name)) next.add(name)
  return next
}

export function Crawlers({ site, query }: { site: Site; query: ReportQuery }) {
  const [data, setData] = useState<CrawlerReport | null>(null)
  const [err, setErr] = useState(false)
  const [kind, setKind] = useState<CrawlKind>('answer')
  const [off, setOff] = useState<Set<string>>(new Set())
  const [help, setHelp] = useState(false)

  useEffect(() => {
    let live = true
    more
      .crawlers(site.id, query)
      .then((d) => live && setData(d))
      .catch(() => live && setErr(true))
    return () => {
      live = false
    }
  }, [site.id, query])

  const inKind = useMemo(() => (data?.series ?? []).filter((s) => s.kind === kind), [data, kind])
  const shown = useMemo(() => inKind.filter((s) => !off.has(s.name)), [inKind, off])
  const reads = useMemo(() => (data?.reads ?? []).filter((r) => r.kind === kind && !off.has(r.name)).slice(0, 10), [data, kind, off])
  const label = KINDS.find((k) => k.id === kind)?.label ?? ''

  if (err) return null
  return (
    <Card variant="open" className="crawl" label={copy.title}>
      <div className="crawl-head">
        <div className="tabs" role="tablist" aria-label={copy.tabs}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
              <span className="faint num crawl-count">{fmtInt(data?.kinds?.[k.id] ?? 0)}</span>
            </button>
          ))}
        </div>
        <Info text={KINDS.find((k) => k.id === kind)?.what ?? ''} />
        <button type="button" className="btn ghost crawl-feed" onClick={() => setHelp(true)}>
          {copy.feed}
        </button>
      </div>

      {!data && <Loading height={170} />}
      {data && data.total === 0 && <p className="muted crawl-help">{copy.empty}</p>}
      {data && data.total > 0 && (
        <>
          <CrawlerChart series={shown} buckets={data.buckets} label={copy.over(label)} />
          <CrawlerList series={inKind} off={off} onToggle={(n) => setOff((o) => toggled(o, n))} empty={copy.none(label)} />
          <CrawlerReads reads={reads} />
          {data.errors > 0 && <span className="faint crawl-small">{copy.errors(fmtInt(data.errors), data.errors > 1)}</span>}
          {(data.folded ?? 0) > 0 && <span className="faint crawl-small">{copy.folded(fmtInt(data.folded ?? 0))}</span>}
        </>
      )}

      {help && <CrawlerSetup site={site} on onChanged={() => undefined} onClose={() => setHelp(false)} />}
    </Card>
  )
}
