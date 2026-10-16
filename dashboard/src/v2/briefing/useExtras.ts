// The two things a card can say that come from outside the report: a new mention of the site today, and pages that got
// slower than their usual. Each is asked once and never blocks the page.
import { useEffect, useState } from 'react'
import { more } from '../../lib/apiMore'
import { addDays, diffDays, type ISODate, type Range } from '../../lib/dates'
import type { SearchReport, Site } from '../../lib/api'
import { extrasApi, type Buyer } from '../../features/extras/extrasApi'
import { heatApi } from '../../features/heatmap/api'
import { isShared } from '../../lib/me'
import { mentionsApi, type Mention } from '../../features/mentions/api'

export interface SearchStory {
  cur: SearchReport
  prev: SearchReport | null
}

export interface Stuck {
  page: string
  views: number
  /** What was pressed again and again, most first. */
  rage: { el: string; n: number }[]
}

export interface Extras {
  mention: Mention | null
  speed: { cur: [number, number, number]; usual: [number, number, number] } | null
  /** The latest sales of the period, when payments are connected. */
  buyers: Buyer[] | null
  /** What Google sent, against the period before, when Search Console is connected. */
  search: SearchStory | null
  /** A page people got stuck on, when heatmaps are on. */
  stuck: Stuck | null
}

export interface ExtrasWant {
  money: boolean
  search: boolean
  /** The page to look at for stuck visitors. */
  page: string | null
}

const none: Extras = { mention: null, speed: null, buyers: null, search: null, stuck: null }

export function useExtras(site: Site, today: ISODate, range: Range, want: ExtrasWant, on: boolean): Extras {
  const [got, setGot] = useState<{ key: string; x: Extras } | null>(null)
  const key = `${site.id}|${today}|${range.from}|${range.to}|${want.money}|${want.search}|${want.page}`
  useEffect(() => {
    if (!on || isShared()) return
    let live = true
    const day0 = Math.floor(new Date(today + 'T00:00:00Z').getTime() / 1000)
    const mention = site.mentions ? mentionsApi.list(site.id, '7d').then((r) => r.mentions.filter((m) => m.posted_at >= day0 - 3600).sort((a, b) => b.posted_at - a.posted_at)[0] ?? null, () => null) : Promise.resolve(null)
    const vit = (from: ISODate, to: ISODate) => more.vitals(site.id, { from, to }).then((v) => (v.samples >= 5 && v.lcp_ms != null && v.inp_ms != null && v.cls_1k != null ? ([v.lcp_ms / 1000, v.inp_ms, v.cls_1k / 1000] as [number, number, number]) : null), () => null)
    const buyers = want.money ? extrasApi.buyers(site.id, { from: range.from, to: range.to }, 20).then((r) => r.buyers ?? [], () => null) : Promise.resolve(null)
    // Google is a day behind, so a single day is read as the week it ends.
    const days = diffDays(range.from, range.to) + 1
    const span = Math.max(7, days)
    const cur: Range = { from: addDays(range.to, -(span - 1)), to: range.to }
    const before: Range = { from: addDays(cur.from, -span), to: addDays(cur.from, -1) }
    const search = want.search
      ? Promise.all([more.searchReport(site.id, cur, 'query'), more.searchReport(site.id, before, 'query').catch(() => null)]).then(([c, p]): SearchStory => ({ cur: c, prev: p }), () => null)
      : Promise.resolve(null)
    const stuck = want.page
      ? heatApi.map(site.id, range, want.page, 0).then((m): Stuck | null => (m.rage.length ? { page: want.page ?? '', views: m.views, rage: m.rage.map((r) => ({ el: r.el, n: r.n })) } : null), () => null)
      : Promise.resolve(null)
    void Promise.all([mention, vit(today, today), vit(addDays(today, -28), addDays(today, -1)), buyers, search, stuck]).then(([m, c, u, b, sr, st]) => live && setGot({ key, x: { mention: m, speed: c && u ? { cur: c, usual: u } : null, buyers: b, search: sr, stuck: st } }))
    return () => {
      live = false
    }
  }, [key, site.id, site.mentions, today, on, range, want.money, want.search, want.page])
  return got && got.key === key ? got.x : none
}
