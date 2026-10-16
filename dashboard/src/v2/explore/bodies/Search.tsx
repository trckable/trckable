// Search: what Google says brought people (Search Console). Not connected is a row that says how it helps and
// connects; connected is four numbers and the searches or pages behind them, against the period before.
import { useEffect, useState } from 'react'
import { fmtInt } from '../../../lib/format'
import type { Range } from '../../../lib/dates'
import { addDays } from '../../../lib/dates'
import { more } from '../../../lib/apiMore'
import type { SearchReport, Site } from '../../../lib/api'
import { setupOf } from '../../briefing/steps'
import { SetupRow } from '../../ui/ConnectPlaceholder'
import { copy } from '../copy'
import { XCols, XEmpty, XKc, XNote, XSub, type ColRow } from '../ui'
import { noteOf } from '../../briefing/kpis'

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : fmtInt(n))

/** Position is better the lower it is: moving up is a smaller number. */
function positionNote(now: number, was: number | undefined): { t: string; up?: boolean; dn?: boolean } {
  if (was === undefined) return { t: '' }
  if (now < was - 0.5) return { t: copy.higherUp, up: true }
  return now > was + 0.5 ? { t: copy.lowerDown, dn: true } : { t: copy.cards.asUsual }
}

const toneOf = (n: { up?: boolean; dn?: boolean }): 'up' | 'dn' | '' => {
  if (n.dn) return 'dn'
  return n.up ? 'up' : ''
}

const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 864e5) + 1

export function useSearch(site: Site, range: Range, dim: 'query' | 'page') {
  const [got, setGot] = useState<{ key: string; now: SearchReport | null; before: SearchReport | null; connected: boolean } | null>(null)
  const key = `${site.id}|${range.from}|${range.to}|${dim}`
  useEffect(() => {
    let live = true
    const n = days(range.from, range.to)
    void more.searchConsole(site.id).then(
      async (c) => {
        if (!c.connected) return live && setGot({ key, now: null, before: null, connected: false })
        const [now, before] = await Promise.all([more.searchReport(site.id, { from: range.from, to: range.to }, dim).catch(() => null), more.searchReport(site.id, { from: addDays(range.from, -n), to: addDays(range.from, -1) }, dim).catch(() => null)])
        if (live) setGot({ key, now, before, connected: true })
      },
      () => live && setGot({ key, now: null, before: null, connected: false }),
    )
    return () => {
      live = false
    }
  }, [key, site.id, range.from, range.to, dim])
  return got && got.key === key ? got : null
}

export function Search({ site, range, limit, onAll, onGoal }: { site: Site; range: Range; limit: number; onAll: () => void; onGoal: () => void }) {
  const [dim, setDim] = useState<'query' | 'page'>('query')
  const r = useSearch(site, range, dim)
  if (!r) return null
  if (!r.connected) return <SetupRow s={setupOf('search', site, onGoal)} big />
  const rows = r.now?.rows ?? []
  if (!r.now || rows.length === 0) return <XEmpty title={copy.searchNone} sub={copy.searchNoneSub} />
  const before = r.before
  const ctr = r.now.impressions ? r.now.clicks / r.now.impressions : 0
  const ctr0 = before && before.impressions ? before.clicks / before.impressions : undefined
  const pos = rows.reduce((a, x) => a + x.position * x.impressions, 0) / Math.max(1, r.now.impressions)
  const pos0 = before?.rows?.length ? before.rows.reduce((a, x) => a + x.position * x.impressions, 0) / Math.max(1, before.impressions) : undefined
  const tone = (n: Parameters<typeof noteOf>[0], w: number | undefined) => noteOf(n, w, copy.before)
  const mx = Math.max(1, ...rows.map((x) => x.clicks))
  const cols: ColRow[] = rows.map((x) => ({ key: x.key, a: dim === 'query' ? `“${x.key}”` : x.key, bar: x.clicks / mx, mono: dim === 'page', c: [fmtInt(x.clicks), k(x.impressions), pct1(x.ctr), x.position.toFixed(1)] }))
  const c = tone(r.now.clicks, before?.clicks)
  const i = tone(r.now.impressions, before?.impressions)
  const t = tone(ctr, ctr0)
  const p = positionNote(pos, pos0)
  return (
    <>
      <div className="kcs xk">
        <XKc icon="click" label={copy.clicks} value={fmtInt(r.now.clicks)} note={c.t} tone={toneOf(c)} line={before ? copy.was(fmtInt(before.clicks)) : ''} />
        <XKc icon="people" label={copy.impressions} value={k(r.now.impressions)} note={i.t} tone={toneOf(i)} line={before ? copy.was(k(before.impressions)) : ''} />
        <XKc icon="goal" label={copy.clickRate} value={pct1(ctr)} note={t.t} tone={toneOf(t)} line={ctr0 === undefined ? '' : copy.was(pct1(ctr0))} />
        <XKc icon="uptime" label={copy.position} value={pos.toFixed(1)} note={p.t} tone={toneOf(p)} line={copy.positionLine} />
      </div>
      <XSub items={[{ id: 'query' as const, name: copy.queries }, { id: 'page' as const, name: copy.pagesWord }]} cur={dim} label={copy.searchBy} onPick={setDim} />
      <XCols first={dim === 'query' ? copy.query : copy.page} cols={[{ h: copy.clicks }, { h: copy.imprShort, m: true }, { h: copy.ctr, m: true }, { h: copy.posShort }]} rows={cols} xc="minmax(0,1fr) 64px 64px 56px 48px" xcm="minmax(0,1fr) 56px 44px" limit={limit} showAll={copy.showAll} onAll={onAll} />
      <XNote>{copy.searchNote}</XNote>
    </>
  )
}
