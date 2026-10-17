// The slices a card is told by (sources, countries, devices, pages), each with its usual: what the server says the same
// weekday brought, for a day; the period before, for anything longer. And the two extra answers a card gives: the page
// a source's people landed on, and the source a country's came from.
import { goalName } from '../../lib/goalName'
import { useEffect, useMemo, useState } from 'react'
import { api, call, rangeQS, type Filter, type Result, type Row, type Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { sourceName, type Unit, type Usual } from './model'
import { movers, type Dim, type Slice } from './cards'
import { bandFromBefore, bandFromWeeks, type Band } from './usual'

const DIMS: { dim: Dim; take: number }[] = [
  { dim: 'referrer', take: 6 },
  { dim: 'country', take: 5 },
  { dim: 'device', take: 3 },
  { dim: 'entry_page', take: 5 },
]

const cache = new Map<string, Promise<Band | null>>()

/** What the server says the same weekday brought for the people who match the filters, as a band; null when it has too few weeks to say. */
export function usualBand(site: string, day: string, fs: Filter[]): Promise<Band | null> {
  const key = `${site}|${day}|${fs.map((f) => `${f.dim}${f.op ?? '='}${f.value}`).join('&')}`
  let p = cache.get(key)
  if (!p) {
    p = call<Usual>('GET', `/sites/${encodeURIComponent(site)}/usual` + rangeQS({ from: day, to: day, filters: fs }), undefined, undefined, true).then(
      (u) => bandFromWeeks((u.weeks ?? []).map((w) => w.visitors)),
      () => null,
    )
    cache.set(key, p)
    setTimeout(() => cache.delete(key), 60_000)
  }
  return p
}

export interface SliceData {
  slices: Record<Dim, Slice[]>
  topPage?: { for: string; name: string; value: string }
  topSource?: { for: string; name: string }
  /** The goals, each against its usual. */
  goals: Slice[]
  /** The country card's own line, bucket by bucket. */
  spark: number[]
  /** Read for the period on screen (false while the last period's are still shown). */
  fresh?: boolean
}

const rowsOf = (cur: Result, dim: Dim): Row[] => cur.dims[dim] ?? []
const isSelf = (v: string, self: string) => !v || v.replace(/^www\./, '') === self.replace(/^www\./, '')

export function useSlices(site: Site, range: Range, cur: Result | undefined, prev: Result | undefined, unit: Unit, total: number, ready: boolean): SliceData {
  const [got, setGot] = useState<{ key: string; data: SliceData } | null>(null)
  const key = `${site.id}|${range.from}|${range.to}|${cur?.kpis.visitors}|${ready}`
  useEffect(() => {
    if (!cur || !ready) return
    let live = true
    const day = unit === 'today' || unit === 'yesterday'
    void (async () => {
      const out = {} as Record<Dim, Slice[]>
      for (const { dim, take } of DIMS) {
        const rows = rowsOf(cur, dim).filter((r) => dim !== 'referrer' || !isSelf(r.value, site.domain)).slice(0, take)
        const bands = await Promise.all(rows.map((r) => (day ? usualBand(site.id, range.to, [{ dim, value: r.value }]) : Promise.resolve(bandFromBefore(rowsOf(prev ?? cur, dim).find((x) => x.value === r.value && prev)?.visitors)))))
        out[dim] = rows.map((r, i) => ({ value: r.value, name: dim === 'referrer' ? sourceName(r.value) : r.value, v: r.visitors, band: bands[i], bounce: r.bounce_rate }))
      }
      const gl = (cur.goals ?? []).filter((g) => g.visitors > 0 || day).slice(0, 8)
      const gb = await Promise.all(gl.map((g) => (day ? usualBand(site.id, range.to, [{ dim: 'goal', value: g.value }]) : Promise.resolve(bandFromBefore(prev?.goals?.find((x) => x.value === g.value)?.visitors)))))
      const goals = gl.map((g, i): Slice => ({ value: g.value, name: goalName(g.label, g.value), v: g.visitors, band: gb[i] }))
      const src = movers(out.referrer, total).sort((a, b) => Math.abs(b.v - (b.band?.c ?? 0)) - Math.abs(a.v - (a.band?.c ?? 0)))[0]
      const cty = movers(out.country, total)[0]
      const [page, from] = await Promise.all([
        src ? api.report(site.id, { from: range.from, to: range.to, filters: [{ dim: 'referrer', value: src.value }] }).then((r) => r.current.dims.entry_page?.[0], () => undefined) : undefined,
        cty ? api.report(site.id, { from: range.from, to: range.to, filters: [{ dim: 'country', value: cty.value }] }).then((r) => ({ from: r.current.dims.referrer?.find((x) => x.value && !isSelf(x.value, site.domain)), spark: (r.current.series ?? []).map((p) => p.visitors) }), () => undefined) : undefined,
      ])
      if (live)
        setGot({
          key,
          data: {
            fresh: true,
            slices: out,
            goals,
            topPage: src && page ? { for: src.value, name: page.value, value: page.value } : undefined,
            topSource: cty && from?.from ? { for: cty.value, name: sourceName(from.from.value) } : undefined,
            spark: from?.spark ?? [],
          },
        })
    })()
    return () => {
      live = false
    }
  }, [key, cur, prev, ready, unit, site.id, site.domain, range.from, range.to, total])
  // What was read for the last period stays on screen, marked as not fresh, until the new one is here.
  const old = useMemo((): SliceData => ({ ...(got?.data ?? { slices: { referrer: [], country: [], device: [], entry_page: [] }, goals: [], spark: [] }), fresh: false }), [got])
  return got && got.key === key ? got.data : old
}
