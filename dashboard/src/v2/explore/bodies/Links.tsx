// Links & bots: the clicks that leave the site, and the robots that read it (counted apart from people).
import { useEffect, useState } from 'react'
import { call, rangeQS, type CrawlerReport, type Site } from '../../../lib/api'
import { more } from '../../../lib/apiMore'
import type { Range } from '../../../lib/dates'
import { fmtInt } from '../../../lib/format'
import { copy } from '../copy'
import { XCols, XEmpty, XNote, type ColRow } from '../ui'

interface Prop {
  key: string
  value: string
  visitors: number
  events: number
}

export function Outbound({ site, range, limit, onAll }: { site: Site; range: Range; limit: number; onAll: () => void }) {
  const [rows, setRows] = useState<Prop[] | null>(null)
  useEffect(() => {
    let live = true
    void call<{ properties: Prop[] | null }>('GET', `/sites/${site.id}/report/goal-props` + rangeQS({ from: range.from, to: range.to }) + '&goal=outbound_click').then((r) => live && setRows(r.properties ?? []), () => live && setRows([]))
    return () => {
      live = false
    }
  }, [site.id, range.from, range.to])
  if (!rows) return null
  if (!rows.length) return <XEmpty title={copy.outboundNone} sub={copy.outboundNoneSub} />
  const mx = Math.max(1, ...rows.map((r) => r.events))
  const cols: ColRow[] = rows.map((r) => ({ key: r.key + r.value, a: r.value, bar: r.events / mx, mono: true, c: [fmtInt(r.events)] }))
  return (
    <>
      <XCols first={copy.link} cols={[{ h: copy.clicksWord }]} rows={cols} xc="minmax(0,1fr) 84px" limit={limit} showAll={copy.showAll} onAll={onAll} />
      <XNote>{copy.outboundNote}</XNote>
    </>
  )
}

export function Bots({ site, range }: { site: Site; range: Range }) {
  const [r, setR] = useState<CrawlerReport | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void more.crawlers(site.id, { from: range.from, to: range.to }).then((x) => live && setR(x), () => live && setR(null))
    return () => {
      live = false
    }
  }, [site.id, range.from, range.to])
  if (r === undefined) return null
  if (!r || !r.series?.length) return <XEmpty title={copy.botsNone} sub={copy.botsNoneSub} />
  const tot = Math.max(1, r.total)
  const mx = Math.max(1, ...r.series.map((s) => s.total))
  const cols: ColRow[] = r.series.map((s) => ({ key: s.name, a: s.name, bar: s.total / mx, c: [fmtInt(s.total), `${Math.round((s.total / tot) * 100)}%`] }))
  return (
    <>
      <XCols first={copy.bot} cols={[{ h: copy.requests }, { h: copy.share }]} rows={cols} xc="minmax(0,1fr) 84px 64px" limit={99} showAll={copy.showAll} onAll={() => undefined} />
      <XNote>{copy.botsNote}</XNote>
    </>
  )
}
