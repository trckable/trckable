// What All sites says about the sites, from numbers the page
// already has: the overview's daily series (the last bucket is today), the
// sites list, and the busy moments. No new reads.
import { sourceLine, type Surge } from '../features/signals/surge'
import { statusOf, type Status } from '../features/sitestatus/status'
import { span } from '../features/sitestatus/time'
import type { Site, SiteRow } from '../lib/api'
import { fmtInt, fmtMoney } from '../lib/format'
import { tag } from '../i18n'
import { next } from './allNextCopy'

/** How much of the site's own day has passed, 0 to 1. */
export function dayFraction(tz: string | undefined, now = Date.now()): number {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(now))
    const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0)
    const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0)
    return (h * 60 + m) / 1440
  } catch {
    return 0.5
  }
}

export type Kind = 'attention' | 'mover' | 'steady'

export interface Item {
  row: SiteRow
  site?: Site
  status: Status
  kind: Kind
  /** Visitors so far today. */
  today: number
  /** What the same weekday last week (else yesterday) had by this hour, spread evenly over the day; null when too little to say. */
  usual: number | null
  /** Today against usual, as a fraction (0.2 is 20% more). */
  move: number | null
  online: number
  /** A busy moment going on now, from the server. */
  surge?: Surge
}

/** A day as people say it: the weekday for the last six days, else the date. */
export function dayWord(unix: number, now = Date.now()): string {
  const old = now / 1000 - unix > 6 * 86400
  return new Date(unix * 1000).toLocaleDateString(tag, old ? { day: 'numeric', month: 'short' } : { weekday: 'short' })
}

/** Names the day the comparison rests on, in words. */
export const refWord = (rows: SiteRow[], now = Date.now()): string => {
  const len = Math.max(0, ...rows.map((r) => r.series?.length ?? 0))
  if (len < 8) return next.yesterday
  return next.lastDay(new Date(now - 7 * 86400_000).toLocaleDateString(tag, { weekday: 'long' }))
}

const refOf = (s: number[] | null): number | null => {
  if (!s || s.length < 2) return null
  return s.length >= 8 ? s[s.length - 8] : s[s.length - 2]
}

const MOVE = 0.4
const MIN_USUAL = 8

export function items(rows: SiteRow[], sites: Site[], surges: Map<string, Surge> = new Map(), now = Date.now()): Item[] {
  const by = new Map(sites.map((s) => [s.id, s]))
  return rows.map((row) => {
    const site = by.get(row.id)
    const status = site ? statusOf(site, now) : 'ok'
    const today = row.series?.[row.series.length - 1] ?? 0
    const ref = refOf(row.series)
    const frac = dayFraction(site?.timezone, now)
    const usual = ref !== null && frac >= 0.15 ? ref * frac : null
    const move = usual !== null && usual >= MIN_USUAL ? (today - usual) / usual : null
    const dormant = status === 'quiet' && !!site?.last_event_at && now / 1000 - site.last_event_at > 30 * 86400
    const hurt = row.error || status === 'down' || (status === 'quiet' && !dormant)
    const found = surges.get(row.id)
    const surge = found && !found.ended ? found : undefined
    const unusual = !!surge || (move !== null && Math.abs(move) >= MOVE)
    let kind: Kind = 'steady'
    if (hurt) kind = 'attention'
    else if (unusual) kind = 'mover'
    return { row, site, status, kind, today, usual, move, online: row.error ? 0 : row.online, surge }
  })
}

const KIND_ORDER: Record<Kind, number> = { attention: 0, mover: 1, steady: 2 }

/** Attention first (down before quiet), then the biggest movers, then steady by today's visitors. */
export function ordered(list: Item[]): Item[] {
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (a.kind === 'attention') return (a.status === 'down' ? 0 : 1) - (b.status === 'down' ? 0 : 1) || b.today - a.today
    if (a.kind === 'mover') return (b.surge?.times ?? 0) - (a.surge?.times ?? 0) || Math.abs(b.move ?? 0) - Math.abs(a.move ?? 0)
    return b.today - a.today
  })
}

/** The most revenue first; a site with none, or that could not be read, last. */
export const byRevenue = (list: Item[]): Item[] => [...list].sort((a, b) => (b.row.error ? -1 : (b.row.revenue ?? -1)) - (a.row.error ? -1 : (a.row.revenue ?? -1)))

const pctWord = (x: number) => `${fmtInt(Math.abs(x) * 100)}%`

const compare = (d: number, ref: string): string => {
  if (Math.abs(d) < 0.03) return next.sameAs(ref)
  return d > 0 ? next.moreThan(pctWord(d), ref) : next.lessThan(pctWord(d), ref)
}

/** The one sentence at the top: facts that are unknown are left out. */
export function headline(list: Item[], rows: SiteRow[], now = Date.now()): { lead: string; tail: string; fine: boolean } {
  const ok = list.filter((i) => !i.row.error)
  const today = ok.reduce((n, i) => n + i.today, 0)
  const withRef = ok.filter((i) => i.usual !== null && i.usual >= MIN_USUAL)
  const usual = withRef.reduce((n, i) => n + (i.usual ?? 0), 0)
  const got = withRef.reduce((n, i) => n + i.today, 0)
  const ref = refWord(rows, now)
  let lead = next.visitorsToday(fmtInt(today), ok.length)
  if (usual > 0) {
    const d = (got - usual) / usual
    lead += ', ' + compare(d, ref)
  }
  lead += '.'
  const bad = list.filter((i) => i.kind === 'attention')
  const parts = bad.slice(0, 2).map((i) => {
    const name = i.row.name || i.row.domain
    if (i.status === 'down') return next.isDown(name)
    if (i.status === 'quiet' && i.site?.last_event_at) {
      return next.quietSince(name, dayWord(i.site.last_event_at, now))
    }
    return ''
  }).filter(Boolean)
  if (bad.length > 2) parts.push(next.moreLook(bad.length - 2))
  const fine = bad.length === 0 ? next.allFine(list.length) : ''
  return { lead, tail: parts.length ? parts.join(' ') : fine, fine: bad.length === 0 }
}

/** Revenue per currency, summed over the rows that have any; empty when no site has payments. */
export function revenueOf(rows: SiteRow[]): { currency: string; exponent: number; minor: number }[] {
  const m = new Map<string, { currency: string; exponent: number; minor: number }>()
  for (const r of rows) {
    if (r.error || r.revenue === undefined) continue
    const e = m.get(r.currency) ?? { currency: r.currency, exponent: r.exponent, minor: 0 }
    e.minor += r.revenue
    m.set(r.currency, e)
  }
  return [...m.values()].sort((a, b) => b.minor - a.minor)
}

export const moneyText = (r: { currency: string; exponent: number; minor: number }[]): string => r.map((x) => fmtMoney(x.minor, x.currency, x.exponent, { cents: false })).join(' + ')

export function statusText(i: Item, now = Date.now()): string {
  if (i.row.error) return next.statusUnread
  if (i.status === 'down') return next.statusDown
  if (i.status === 'new') return next.statusNew
  if (i.status === 'quiet' && i.site?.last_event_at) return next.statusQuiet(span(now / 1000 - i.site.last_event_at))
  return next.statusUp
}

/** The one line about why a row sits where it does. */
export function whyLine(i: Item, ref: string, now = Date.now()): string {
  const last = i.site?.last_event_at
  if (i.row.error) return next.whyUnread
  const since = i.site?.check?.down_since
  if (i.status === 'down') return since ? next.whyDown(dayWord(since, now)) : next.whyDownNow
  if (i.status === 'quiet' && last && i.kind === 'steady') return next.whyDormant(dayWord(last, now))
  if (i.status === 'quiet' && last) return next.whyQuiet(span(now / 1000 - last), dayWord(last, now))
  if (i.status === 'new') return next.whyNew
  if (i.surge) return next.surgeWhy(i.surge.times.toFixed(1), sourceLine(i.surge))
  // Who is online now is the Live column's; a row compares today with the usual, or says nothing.
  return i.usual !== null ? next.whyMover(fmtInt(i.today), fmtInt(i.usual), ref) : ''
}

export interface FeedEvent {
  key: string
  at: number
  text: string
  detail: string
  tone: 'live' | 'warn' | 'bad'
  /** Whose event it is: the feed draws its mark. */
  mark: Pick<Site, 'domain' | 'color' | 'icon_url'>
}

/** What is happening across the sites, newest first: busy moments, people online, sites that went quiet or down. */
export function feedOf(list: Item[]): FeedEvent[] {
  const out: FeedEvent[] = []
  for (const i of list) {
    if (i.row.error) continue
    const name = i.row.name || i.row.domain
    const surge = i.surge
    const last = i.site?.last_event_at
    const mark = i.site ?? i.row
    if (surge) out.push({ key: i.row.id + 's', at: surge.started, text: next.feedSurge(name, surge.times.toFixed(1)), detail: sourceLine(surge), tone: 'live', mark })
    else if (i.online > 0 && last) out.push({ key: i.row.id + 'o', at: last, text: next.feedOnline(name, i.online), detail: '', tone: 'live', mark })
    if (i.status === 'down' && i.site?.check) out.push({ key: i.row.id + 'd', at: i.site.check.down_since ?? i.site.check.at, text: next.feedDown(name), detail: '', tone: 'bad', mark })
    if (i.status === 'quiet' && last && i.kind === 'attention') out.push({ key: i.row.id + 'q', at: last, text: next.feedQuiet(name), detail: '', tone: 'warn', mark })
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 12)
}
