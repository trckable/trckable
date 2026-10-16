// What the Briefing says, by rules only: the sentence, the three scores, the day
// against its usual band and the cards in the order worth reading. "Usual" is the
// weekday's average where the server gives one (visitors), and the period before
// everywhere else. Pure: model.test.ts.
import type { Filter, Point, Result, Row } from '../../lib/api'
import { fmtFixed, fmtInt } from '../../lib/format'
import { baseEnough, MAX_TIMES, tooFew } from '../../lib/thin'
import { KNOWN } from '../../features/markers/sources'
import { copy } from './copy'
import { judge, type Band as UsualBand } from './usual'

export type Unit = 'today' | 'yesterday' | 'week' | 'month' | 'range'

/** The kind of period a preset (or a custom range) is: it chooses the words. */
export function unitOf(period: string): Unit {
  if (period === 'today' || period === 'now') return 'today'
  if (period === 'yesterday') return 'yesterday'
  if (['7d', '14d', 'wtd', 'lastweek'].includes(period)) return 'week'
  if (['28d', '30d', 'mtd', 'lastmonth'].includes(period)) return 'month'
  return 'range'
}

/** What the server calls usual for the day: today's visitors, the average of the same weekday up to the same time, and the weeks behind it. */
export interface Usual {
  visitors: number
  average: number
  weeks: { day: string; visitors: number }[] | null
}

/** An earlier figure is a base worth measuring against from this many. */
export const timesOf = (now: number, before: number | undefined, floor = 1): number | null => (before !== undefined && before >= floor ? now / before : null)

/** "21×", "2.4×": the multiple with one decimal under ten, whole above, and never a huge number. */
export function mult(r: number): string {
  const cap = Math.min(r, MAX_TIMES * 10)
  const x = cap >= 10 ? Math.round(cap) : Math.round(cap * 10) / 10
  return `${Number.isInteger(x) ? String(x) : fmtFixed(x, 1)}×`
}

const host = (v: string) => v.replace(/^www\./, '')
const rowOf = (rows: Row[] | null | undefined, value: string) => rows?.find((r) => r.value === value)
const people = (n: number) => (n === 1 ? '1 person' : `${fmtInt(n)} people`)

/** A host as people say it: "Hacker News" for news.ycombinator.com, the host itself when it is not a known place. */
export function sourceName(value: string): string {
  const h = host(value)
  return KNOWN.find((k) => k.hosts.some((x) => h === x || h.endsWith('.' + x)))?.name ?? h
}

export interface Top {
  name: string
  value: string
  visitors: number
  /** Against the period before, when that had enough of this source to measure. */
  times: number | null
}

/** The one outside site that sent the period's visitors: big enough to name, and not the site itself. */
export function topSource(cur: Result, prev: Result | undefined, self: string): Top | null {
  const row = (cur.dims.referrer ?? []).find((r) => r.value && host(r.value) !== host(self))
  if (!row || row.visitors < 5 || row.visitors / Math.max(1, cur.kpis.visitors) < 0.2) return null
  return { name: sourceName(row.value), value: row.value, visitors: row.visitors, times: timesOf(row.visitors, rowOf(prev?.dims.referrer, row.value)?.visitors, 3) }
}

// ---- the sentence ----

export interface Part {
  t: string
  em?: boolean
}
export interface Sentence {
  lead: string
  /** The full headline after the lead, and the one line a phone shows. */
  long: Part[]
  short: Part[]
  sub: string
  bad: boolean
}

export interface SayIn {
  cur: Result
  prev?: Result
  usual?: Usual | null
  unit: Unit
  weekday: string
  self: string
  /** The site stopped answering during the period, in minutes (0 for none). */
  downMin: number
  /** Fewer visitors than a base worth measuring: people, not percentages. */
  learning: boolean
}

function paid(r: Result): number {
  return r.money ? Math.max(r.money.paying_visitors, r.money.customers, 0) : 0
}

/** Today (or yesterday) against what the weekday usually brings, when the server says; otherwise the period before. */
function baseline(o: SayIn): { ratio: number | null; words: string } {
  const u = o.usual
  if (u && (u.weeks?.length ?? 0) > 0 && u.average >= 5 && (o.unit === 'today' || o.unit === 'yesterday')) {
    return { ratio: o.cur.kpis.visitors / u.average, words: `a usual ${o.weekday}` }
  }
  const before = o.prev && baseEnough(o.prev.kpis.visitors) ? o.prev.kpis.visitors : undefined
  return { ratio: timesOf(o.cur.kpis.visitors, before), words: copy.before[o.unit] }
}

function moodWord(bumpy: boolean, up: boolean, down: boolean): string {
  if (bumpy) return copy.bumpy
  if (up) return copy.busy
  return down ? copy.slow : copy.calm
}

/** The sentence at the top, from the same rules as the mock: the mood of the period, who brought the people, and whether anyone paid. */
export function sentence(o: SayIn): Sentence {
  const v = o.cur.kpis.visitors
  const { ratio, words } = baseline(o)
  const top = topSource(o.cur, o.prev, o.self)
  const x = top?.times && top.times >= 1.5 ? mult(top.times) : ''
  const noun = { today: o.weekday, yesterday: o.weekday, week: copy.week, month: copy.month, range: copy.stretch }[o.unit]
  const n = paid(o.cur)
  const c2 = n > 0 ? [{ t: copy.paid(n), em: true }] : []
  const andC2: Part[] = c2.length ? [{ t: ', and ' }, ...c2] : []
  if (v === 0) {
    const lead = copy.nobody(copy.when[o.unit])
    return { lead, long: [], short: [{ t: `${lead}.`, em: true }], sub: '', bad: false }
  }
  if (o.learning) {
    return { lead: copy.dayOne, long: [{ t: people(v), em: true }, { t: copy.soFar }, ...andC2, { t: '.' }], short: [{ t: copy.soFarShort(people(v)), em: true }], sub: copy.learnSub, bad: false }
  }
  const up = ratio !== null && ratio >= 1.15
  const down = ratio !== null && ratio <= 0.7
  const adj = moodWord(o.downMin > 0, up, down)
  let c1: Part[]
  let short: Part[]
  if (top && x) {
    c1 = [{ t: `${top.name} brought ${people(top.visitors)}, ${x} ${copy.before[o.unit]}`, em: true }]
    short = [{ t: `${top.name} sent ${x} ${copy.before[o.unit]}.`, em: true }]
  } else if (up) {
    c1 = [{ t: `${people(v)} came, ${ratio >= 1.3 ? `${mult(ratio)} ` : 'above '}${words}` }]
    short = [{ t: `${people(v)} came`, em: true }, { t: `, ${ratio >= 1.3 ? mult(ratio) + ' usual' : 'above usual'}.` }]
  } else if (down) {
    c1 = [{ t: `only ${people(v)} came, below ${words}` }]
    short = [{ t: 'Only ' }, { t: people(v), em: true }, { t: ' came, below usual.' }]
  } else {
    c1 = [{ t: `${people(v)} came, right about what you'd expect` }]
    short = [{ t: `${people(v)} came, as usual.` }]
  }
  const down2 = o.downMin > 0 ? [{ t: ' ' + copy.wasDown(o.downMin) }] : []
  const page = o.cur.dims.entry_page?.[0]
  const sub = page && v >= 10 && page.visitors / v >= 0.4 ? copy.mostLanded(page.value) : ''
  return { lead: `${adj} ${noun}:`, long: [...c1, ...andC2, { t: '.' }, ...down2], short, sub, bad: o.downMin > 0 || down }
}

// ---- the three scores ----

export type Verdict = 'above' | 'usual' | 'below' | 'none' | 'clear' | 'lost' | 'down' | 'off'
export interface Score {
  key: 'traffic' | 'engagement' | 'uptime'
  /** 0 to 100, or null when it cannot be told. */
  value: number | null
  verdict: Verdict
  /** The small words after the number. */
  words: string
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

function fromRatio(key: Score['key'], r: number | null, same: string): Score {
  if (r === null) return { key, value: null, verdict: 'none', words: '' }
  if (r >= 1.1) return { key, value: 100, verdict: 'above', words: key === 'traffic' ? copy.above : same }
  if (r >= 0.9) return { key, value: 100, verdict: 'usual', words: same }
  return { key, value: clamp(r * 100), verdict: 'below', words: key === 'traffic' ? copy.below : copy.leaveEarly }
}

export function trafficScore(cur: Result, prev?: Result): Score {
  return fromRatio('traffic', prev && baseEnough(prev.kpis.visitors) ? timesOf(cur.kpis.visitors, prev.kpis.visitors) : null, copy.normal)
}

/** Traffic against the site's own usual: full marks unless it fell under the band, and then in proportion to how far. */
export function trafficFromBand(v: number, b: UsualBand): Score {
  const st = judge(v, b)
  const value = b.c > 0.5 ? clamp(100 - Math.max(0, (b.lo - v) / Math.max(b.lo, 1)) * 160) : 80
  if (st === 'up') return { key: 'traffic', value, verdict: 'above', words: copy.above }
  return st === 'dn' ? { key: 'traffic', value, verdict: 'below', words: copy.below } : { key: 'traffic', value, verdict: 'usual', words: copy.normal }
}

/** Engagement from the share who left after one page, against what the site usually sees (a few points either way is as usual). */
export function engagementFromBounce(now: number, usual: number | null, sessions: number): Score {
  if (usual === null || tooFew(sessions)) return { key: 'engagement', value: null, verdict: 'none', words: '' }
  const worse = Math.round(now * 100) > Math.round((usual + 0.04) * 100)
  if (worse) return { key: 'engagement', value: clamp(100 - Math.max(0, now - (usual + 0.04)) * 400), verdict: 'below', words: copy.leaveEarly }
  return { key: 'engagement', value: 100, verdict: Math.round(now * 100) < Math.round((usual - 0.04) * 100) ? 'above' : 'usual', words: copy.usual }
}

/** Stays and one-page leaves against the period before; thin visits on either side say nothing. */
export function engagementScore(cur: Result, prev?: Result): Score {
  if (!prev || tooFew(cur.kpis.sessions) || tooFew(prev.kpis.sessions)) return fromRatio('engagement', null, copy.usual)
  const parts: number[] = []
  if (prev.kpis.avg_session_s > 0) parts.push(cur.kpis.avg_session_s / prev.kpis.avg_session_s)
  if (prev.kpis.bounce_rate < 1) parts.push((1 - cur.kpis.bounce_rate) / (1 - prev.kpis.bounce_rate))
  return fromRatio('engagement', parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null, copy.usual)
}

/** What the incident record says of the period: its share up (null when it was not watched long enough, or the checks are off), and whether the site is down right now. */
export function uptimeScore(o: { pct: number | null; downNow: boolean; downMin: number; off: boolean }): Score {
  if (o.off) return { key: 'uptime', value: null, verdict: 'off', words: copy.checksOff }
  if (o.downNow) return { key: 'uptime', value: 0, verdict: 'down', words: copy.downNow }
  if (o.pct === null) return { key: 'uptime', value: null, verdict: 'none', words: '' }
  if (o.pct >= 100) return { key: 'uptime', value: 100, verdict: 'clear', words: copy.clear }
  return { key: 'uptime', value: Math.floor(o.pct), verdict: 'lost', words: copy.downFor(o.downMin) }
}

/** The ring's number: the scores that can be told, averaged; the worst one when the site is down. Null when none can be told. */
export function overall(scores: Score[]): number | null {
  const known = scores.filter((s) => s.value !== null).map((s) => s.value as number)
  if (!known.length) return null
  if (scores.some((s) => s.verdict === 'down')) return null
  return Math.round(known.reduce((a, b) => a + b, 0) / known.length)
}

// ---- the day against its usual band ----

export interface Band {
  values: number[]
  lo: number[]
  hi: number[]
  /** How many points rose above the band, out of how many. */
  above: number
  below: number
  total: number
}

/** Today's hours that have not come yet are not zeros: the line ends at the last hour with anyone in it. */
export function untilNow(points: Point[]): Point[] {
  let end = points.length
  while (end > 2 && points[end - 1].visitors === 0 && points[end - 1].pageviews === 0) end--
  return points.slice(0, end)
}

/** The band is the period before at the same points, a quarter either way. With less than half of them there is no band. */
export function bandOf(cur: Point[], prev: Point[] | undefined): Band {
  const values = cur.map((p) => p.visitors)
  const was = (prev ?? []).map((p) => p.visitors)
  if (values.length < 2 || was.length < values.length / 2) return { values, lo: [], hi: [], above: 0, below: 0, total: values.length }
  const lo = values.map((_, i) => Math.floor((was[i] ?? 0) * 0.75))
  const hi = values.map((_, i) => Math.ceil((was[i] ?? 0) * 1.25) + 1)
  return { values, lo, hi, above: values.filter((v, i) => v > hi[i]).length, below: values.filter((v, i) => v < lo[i]).length, total: values.length }
}

// ---- where a card goes deeper ----

export type Deeper = { kind: 'explore'; filter: Filter } | { kind: 'incidents' } | { kind: 'mentions' } | { kind: 'speed' }
