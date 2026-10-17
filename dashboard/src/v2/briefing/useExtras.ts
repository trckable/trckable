// The two things a card can say that come from outside the report: a new mention of the site today, and pages that got
// slower than their usual. Each is asked once and never blocks the page.
import { goalName } from '../../lib/goalName'
import { useEffect, useMemo, useState } from 'react'
import { more } from '../../lib/apiMore'
import { addDays, diffDays, type ISODate, type Range } from '../../lib/dates'
import type { SearchReport, Site } from '../../lib/api'
import { extrasApi, type Buyer, type Refunds } from '../../features/extras/extrasApi'
import { heatApi } from '../../features/heatmap/api'
import { isShared } from '../../lib/me'
import { mentionsApi, type Mention } from '../../features/mentions/api'
import { leakOf } from '../explore/data/mapSections'
import type { FunnelStep, PaidStep } from '../../lib/api'
import { copy } from './copy'
import { moduleOn } from './moduleOn'

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

export interface FunnelStory {
  steps: { name: string; v: number; c: number }[]
  leak: { at: number; r: number; ur: number }
  /** The page many go to instead of the next step. */
  alt?: string
}

/** The first sale from a country nobody had paid from in the last 90 days. */
export interface FirstFrom {
  country: string
  amount: number
  at: string
  referrer?: string
  /** Visitors from there in the period. */
  people: number
}

export interface Extras {
  mention: Mention | null
  speed: { cur: [number, number, number]; usual: [number, number, number] } | null
  /** The latest sales of the period, when payments are connected. */
  buyers: Buyer[] | null
  /** The payments paid back in the period, when payments are connected. */
  refunds?: Refunds | null
  /** What Google sent, against the period before, when Search Console is connected. */
  search: SearchStory | null
  /** A page people got stuck on, when heatmaps are on. */
  stuck: Stuck | null
  /** The signup path against the period before. */
  funnel: FunnelStory | null
  /** A customer from a country that never had one. */
  first: FirstFrom | null
  /** Read for the period on screen. */
  fresh?: boolean
}

interface ExtrasWant {
  money: boolean
  search: boolean
  /** The page to look at for stuck visitors. */
  page: string | null
  /** The steps of the signup path to read, with the page many go to instead. */
  funnel: { steps: (FunnelStep | PaidStep)[]; alt?: string } | null
  /** The countries the period's people came from, most first, to look for a first customer in. */
  countries: { code: string; people: number }[]
}

const none: Extras = { mention: null, speed: null, buyers: null, search: null, stuck: null, funnel: null, first: null }

/** The path's steps in this period and in the one before it, and the first step where fewer go on than usual. */
function readFunnel(site: string, range: Range, days: number, want: NonNullable<ExtrasWant['funnel']>): Promise<FunnelStory | null> {
  const before: Range = { from: addDays(range.from, -days), to: addDays(range.from, -1) }
  return Promise.all([more.funnel(site, range, want.steps), more.funnel(site, before, want.steps).catch(() => null)]).then(
    ([c, p]) => {
      const steps = c.steps.map((s, i) => ({ name: stepName(s, copy.paidStep), v: s.visitors, c: p?.steps[i]?.visitors ?? 0 }))
      return { steps, leak: leakOf(steps), alt: want.alt }
    },
    () => null,
  )
}

/** The first of the period's top countries with a sale in the period and none in the 90 days before it, once the site has sold enough to say so. */
async function readFirst(site: string, range: Range, countries: ExtrasWant['countries']): Promise<FirstFrom | null> {
  if (!countries.length) return null
  const back: Range = { from: addDays(range.from, -90), to: addDays(range.from, -1) }
  const past = await extrasApi.buyers(site, back, 20).then((r) => r.buyers ?? [], () => [] as Buyer[])
  if (past.length < 10) return null
  for (const c of countries.slice(0, 5)) {
    const f = [{ dim: 'country', value: c.code }]
    const [now, was] = await Promise.all([
      extrasApi.buyers(site, { ...range, filters: f }, 1).then((r) => r.buyers ?? [], () => [] as Buyer[]),
      extrasApi.buyers(site, { ...back, filters: f }, 1).then((r) => r.buyers ?? [], () => [] as Buyer[]),
    ])
    if (now[0] && now[0].amount > 0 && !was.length) return { country: c.code, amount: now[0].amount, at: now[0].at, referrer: now[0].referrer, people: c.people }
  }
  return null
}

/** The same object while its contents are: a list built again from every new report does not read everything again. */
export function useSame<T>(v: T): T {
  const k = JSON.stringify(v)
  return useMemo(() => JSON.parse(k) as T, [k])
}

export function useExtras(site: Site, today: ISODate, range: Range, want: ExtrasWant, on: boolean): Extras {
  const [got, setGot] = useState<{ key: string; x: Extras } | null>(null)
  const funnelKey = want.funnel ? want.funnel.steps.map((x) => x.value).join(',') : ''
  const countryKey = want.countries.map((x) => x.code).join(',')
  const key = `${site.id}|${today}|${range.from}|${range.to}|${want.money}|${want.search}|${want.page}|${funnelKey}|${countryKey}`
  useEffect(() => {
    if (!on || isShared()) return
    let live = true
    const day0 = Math.floor(new Date(today + 'T00:00:00Z').getTime() / 1000)
    const mention = site.mentions ? mentionsApi.list(site.id, '7d').then((r) => r.mentions.filter((m) => m.posted_at >= day0 - 3600).sort((a, b) => b.posted_at - a.posted_at)[0] ?? null, () => null) : Promise.resolve(null)
    const vit = (from: ISODate, to: ISODate) => moduleOn(site.id, 'vitals').then((on) => (on ? more.vitals(site.id, { from, to }) : null)).then((v) => (v && v.samples >= 5 && v.lcp_ms != null && v.inp_ms != null && v.cls_1k != null ? ([v.lcp_ms / 1000, v.inp_ms, v.cls_1k / 1000] as [number, number, number]) : null), () => null)
    const buyers = want.money ? extrasApi.buyers(site.id, { from: range.from, to: range.to }, 20).then((r) => r.buyers ?? [], () => null) : Promise.resolve(null)
    const refunds = want.money ? extrasApi.refunds(site.id, { from: range.from, to: range.to }).then((r) => (r.filtered ? null : r), () => null) : Promise.resolve(null)
    // Google is a day behind, so a single day is read as the week it ends.
    const days = diffDays(range.from, range.to) + 1
    const span = Math.max(7, days)
    const cur: Range = { from: addDays(range.to, -(span - 1)), to: range.to }
    const before: Range = { from: addDays(cur.from, -span), to: addDays(cur.from, -1) }
    const search = want.search
      ? moduleOn(site.id, 'search').then((on) => (on ? Promise.all([more.searchReport(site.id, cur, 'query'), more.searchReport(site.id, before, 'query').catch(() => null)]).then(([c, p]): SearchStory => ({ cur: c, prev: p })) : null)).catch(() => null)
      : Promise.resolve(null)
    const stuck = want.page
      ? heatApi.map(site.id, range, want.page, 0).then((m): Stuck | null => (m.rage.length ? { page: want.page ?? '', views: m.views, rage: m.rage.map((r) => ({ el: r.el, n: r.n })) } : null), () => null)
      : Promise.resolve(null)
    const funnel = want.funnel ? readFunnel(site.id, range, days, want.funnel) : Promise.resolve(null)
    const first = want.money && days <= 31 ? readFirst(site.id, range, want.countries) : Promise.resolve(null)
    void Promise.all([mention, vit(today, today), vit(addDays(today, -28), addDays(today, -1)), buyers, search, stuck, funnel, first, refunds]).then(([m, c, u, b, sr, st, fn, fs, rf]) => live && setGot({ key, x: { fresh: true, mention: m, speed: c && u ? { cur: c, usual: u } : null, buyers: b, refunds: rf, search: sr, stuck: st, funnel: fn, first: fs } }))
    return () => {
      live = false
    }
  }, [key, site.id, site.mentions, today, on, range, want.money, want.search, want.page, want.funnel, want.countries])
  return got && got.key === key ? got.x : none
}

/** A funnel step as it is read: Paid in words, a goal by its label or humanized event name, a page by its path. */
function stepName(s: { kind: string; label?: string; value: string }, paid: string): string {
  if (s.kind === 'paid') return paid
  return s.kind === 'goal' ? goalName(s.label, s.value) : s.label || s.value
}
