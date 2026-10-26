// The two things a card can say that come from outside the report: a new mention of the site today, and pages that got
// slower than their usual. Each is asked once and never blocks the page.
import { goalName } from '../../lib/goalName'
import { useEffect, useMemo, useRef, useState } from 'react'
import { more } from '../../lib/apiMore'
import { addDays, diffDays, type ISODate, type Range } from '../../lib/dates'
import { MIN_VITALS, type SearchReport, type Site } from '../../lib/api'
import { extrasApi, type Buyer, type Refunds } from '../../features/extras/extrasApi'
import { heatApi } from '../../features/heatmap/api'
import { isShared } from '../../lib/me'
import { mentionsApi, type Mention } from '../../features/mentions/api'
import { leakOf } from '../explore/data/mapSections'
import type { FunnelStep, PaidStep } from '../../lib/api'
import { copy } from './copy'
import { moduleOn } from './moduleOn'
import { startOfDay } from '../../features/incidents/model'

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
  /** Read the site's own saved funnel, when it has one; nothing is guessed. */
  funnel: boolean
  /** The countries the period's people came from, most first, to look for a first customer in. */
  countries: { code: string; people: number }[]
}

// The speed figures of a day or a stretch, kept for a minute: the page's other numbers may be asked again (a report lands, a filter is set), the speed of the same days is not.
const heldVitals = new Map<string, { at: number; v: ReturnType<typeof more.vitals> }>()
function vitalsOf(site: string, from: ISODate, to: ISODate) {
  const key = `${site}|${from}|${to}`
  const k = heldVitals.get(key)
  if (k && Date.now() - k.at < 60_000) return k.v
  const v = more.vitals(site, { from, to })
  heldVitals.set(key, { at: Date.now(), v })
  v.catch(() => heldVitals.delete(key)) // a failed read is not kept
  return v
}

/** What the speed of the period is told against: a day against the 28 days before it, a longer stretch against the same number of days before it. */
export function usualSpeed(range: Range, days: number): [ISODate, ISODate] {
  const span = days > 1 ? days : 28
  return [addDays(range.from, -span), addDays(range.from, -1)]
}

const none: Extras = { mention: null, speed: null, buyers: null, search: null, stuck: null, funnel: null, first: null }

/** The path's steps in this period and in the one before it, and the first step where fewer go on than usual. */
function readFunnel(site: string, range: Range, days: number, want: { steps: (FunnelStep | PaidStep)[]; alt?: string }): Promise<FunnelStory | null> {
  const before: Range = { from: addDays(range.from, -days), to: addDays(range.from, -1) }
  return Promise.all([more.funnel(site, range, want.steps), more.funnel(site, before, want.steps).catch(() => null)]).then(
    ([c, p]) => {
      const steps = c.steps.map((s, i) => ({ name: s.kind === 'paid' && i > 0 ? copy.paidStep(stepName(c.steps[i - 1], '')) : stepName(s, copy.paidStep('')), v: s.visitors, c: p?.steps[i]?.visitors ?? 0 }))
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
  const funnelKey = want.funnel ? 'f' : ''
  const countryKey = want.countries.map((x) => x.code).join(',')
  const key = `${site.id}|${today}|${range.from}|${range.to}|${want.money}|${want.search}|${want.page}|${funnelKey}|${countryKey}`
  // What the read uses is in `key`; a report that lands makes new `range` and `want` objects with the same contents, which must not read everything again.
  const latest = useRef({ range, want })
  useEffect(() => {
    latest.current = { range, want }
  })
  useEffect(() => {
    if (!on || isShared()) return
    const { range, want } = latest.current
    let live = true
    const day0 = startOfDay(today, site.timezone)
    const mention = site.mentions ? mentionsApi.list(site.id, '7d').then((r) => r.mentions.filter((m) => m.posted_at >= day0 - 3600).sort((a, b) => b.posted_at - a.posted_at)[0] ?? null, () => null) : Promise.resolve(null)
    const vit = (from: ISODate, to: ISODate) => moduleOn(site.id, 'vitals').then((on) => (on ? vitalsOf(site.id, from, to) : null)).then((v) => (v && v.lcp_ms != null && v.inp_ms != null && v.cls_1k != null && Math.min(v.lcp_n ?? v.samples, v.inp_n ?? v.samples, v.cls_n ?? v.samples) >= MIN_VITALS ? ([v.lcp_ms / 1000, v.inp_ms, v.cls_1k / 1000] as [number, number, number]) : null), () => null)
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
    // Only a funnel the site saved: a path guessed from its busiest pages would say "fewer go on than usual" about steps nobody defined.
    const funnel = want.funnel
      ? more.funnels(site.id).then((r) => {
          const f = r.funnels.find((x) => x.steps.length >= 2)
          return f ? readFunnel(site.id, range, days, { steps: f.steps }) : null
        }, () => null)
      : Promise.resolve(null)
    const first = want.money && days <= 31 ? readFirst(site.id, range, want.countries) : Promise.resolve(null)
    void Promise.all([mention, vit(range.from, range.to), vit(...usualSpeed(range, days)), buyers, search, stuck, funnel, first, refunds]).then(([m, c, u, b, sr, st, fn, fs, rf]) => live && setGot({ key, x: { fresh: true, mention: m, speed: c && u ? { cur: c, usual: u } : null, buyers: b, refunds: rf, search: sr, stuck: st, funnel: fn, first: fs } }))
    return () => {
      live = false
    }
  }, [key, site.id, site.mentions, site.timezone, today, on])
  return got && got.key === key ? got.x : none
}

/** A funnel step as it is read: Paid in words, a goal by its label or humanized event name, a page by its path. */
function stepName(s: { kind: string; label?: string; value: string }, paid: string): string {
  if (s.kind === 'paid') return paid
  return s.kind === 'goal' ? goalName(s.label, s.value) : s.label || s.value
}
