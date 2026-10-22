// What stood out, as cards, by the walkthrough's rules: each kind of change is looked for in the numbers (against the
// usual of that slice, never against nothing), written as one claim with the picture that proves it, a line of why, and
// one thing to do. The cards are ranked by how much they matter and how bad the news is. Pure: cards.test.ts.
import type { Result, Row } from '../../lib/api'
import type { Span } from './outage'
import { countryName, flag, fmtFixed, fmtInt } from '../../lib/format'
import { assistantOf } from '../../features/extras/assistants'
import { copy } from './cards.copy'
import { mult, sourceName, type Deeper, type Unit } from './model'
import { judge, type Band, type Judged } from './usual'
import { whyDown, whyJump, type Why } from './why'
import { firstCard, leakCard, salesCards, searchCard, stuckCard, withStuck, type SalesIn } from './cards.money'
import type { FirstFrom, FunnelStory, SearchStory, Stuck } from './useExtras'

export type Topic = 'uptime' | 'sales' | 'sources' | 'countries' | 'devices' | 'search' | 'pages' | 'goals' | 'peek' | 'mentions' | 'speed' | 'milestone' | 'funnel'
export type Dim = 'referrer' | 'country' | 'device' | 'entry_page'

/** The one thing a card offers to do. */
export type Act =
  | { k: 'copy'; t: string; text: string; done: string }
  | { k: 'set'; t: string; msg: string }
  | { k: 'goal'; t: string; msg: string; page: string }
  | { k: 'x'; t: string }

export type Vis =
  | { k: 'rcpt'; rows: { l: string; t?: string; a?: string; flag?: string; neg?: boolean; more?: boolean; tot?: boolean; mark?: 'up' | 'dn' }[] }
  | { k: 'dots'; n: number; per: number; grey: number; name: string }
  | { k: 'ba'; lo: number; hi: number; c: number; v: number; red: boolean }
  | { k: 'outage'; spans: Span[]; nowAt: number; from: string; now: string }
  | { k: 'funnel'; rows: { name: string; v: number; w: number; hot: string }[] }
  | { k: 'goals'; rows: { name: string; v: number; lo: number; hi: number; st: Judged; pct: number | null }[] }

export interface Story {
  key: Topic
  score: number
  /** A red card: bad news. */
  bad?: boolean
  /** The bold start of the claim, and the quieter rest (with its own punctuation). */
  head: string
  rest?: string
  vis: Vis | null
  why: string
  /** The number in the card's corner, what it counts and as a figure (for Watch). */
  val: string
  m: number
  u: string
  how: string
  ev: string
  act?: Act
  /** A second action, for the ⋯ menu (a prompt to copy). */
  extra?: Act
  /** What else moved, in the same group of cards (sources, countries, devices, pages): named under the card, with a way to all of it. */
  also?: { key: Topic; name: string }[]
  /** The card's subject in a word or two, for the line that names the others. */
  tag?: string
  /** The question "Why?" asks Peek, where there is Peek: this card's claim, as a question. */
  ask?: string
  /** Why it happened, as far as can be known: shown as "Why?" with the evidence. */
  cause?: Why
  deeper: Deeper
  /** A card that is a number with a line (a country). */
  kc?: { flag: string; label: string; note: string; tone: 'up' | 'dn'; filter: { dim: string; value: string } }
}

export interface Slice {
  value: string
  name: string
  v: number
  band: Band | null
  /** Share of this slice's people who left after one page. */
  bounce?: number
}

export interface UptimeIn {
  downNow: boolean
  /** "11:40" and the minutes since, while it goes on. */
  since: string
  minutesNow: number
  incidents: { from: string; to: string }[]
  minutes: number
  /** Visitors a usual stretch of that length brings. */
  lost: number
  cause?: string
  /** Where each outage lies in the period, 0 to 1, and where now is. */
  spans: Span[]
  nowAt: number
  /** What the line starts and ends at, as words: "00:00" for a day, the first date for longer, and the clock now. */
  from: string
  now: string
}

export interface CardsIn {
  domain: string
  cur: Result
  prev?: Result
  unit: Unit
  weekday: string
  learning: boolean
  low: boolean
  /** The slices of the period with their usual (null where there is none to say). */
  slices: Record<Dim, Slice[]>
  /** Each goal against its usual. */
  goals: Slice[]
  /** The page most of a source's people landed on, and the source most of a country's came from. */
  topPageOf?: (referrer: string) => { name: string; value: string } | undefined
  topSourceOf?: (country: string) => string | undefined
  /** The rule that says what "usual" is, in words. */
  rule: string
  uptime: UptimeIn
  mention?: { host: string; title: string; at: string; points: number; comments: number; page: string }
  speed?: { cur: [number, number, number]; usual: [number, number, number] }
  /** What was sold, what Google sent, and where people got stuck: each from its own answer, absent without it. */
  sales?: SalesIn
  search?: SearchStory
  stuck?: Stuck
  /** The signup path, where people leave more than usual. */
  funnel?: FunnelStory
  /** A customer from a country nobody had paid from before. */
  first?: FirstFrom
}

const people = (n: number) => (n === 1 ? '1 person' : `${fmtInt(n)} people`)
const rg = (b: Band) => `${fmtInt(Math.max(0, b.lo))}–${fmtInt(b.hi)}`
const evidence = (v: number, b: Band) => `Now ${fmtInt(v)}, usual ${fmtInt(Math.max(0, b.lo))} to ${fmtInt(b.hi)}.`
/** The slices whose number rose above or fell under their usual, enough to be worth a sentence. */
export function movers(list: Slice[], total: number, exclude?: (s: Slice) => boolean): (Slice & { st: Judged })[] {
  const sig = Math.max(6, total * 0.06)
  return list
    .flatMap((s) => {
      if (!s.band || exclude?.(s)) return []
      const st = judge(s.v, s.band)
      const big = s.v > total * 0.04 || s.band.c > total * 0.04
      return st && big && Math.abs(s.v - s.band.c) > 3 && Math.abs(s.v - s.band.c) >= sig ? [{ ...s, st }] : []
    })
}

function outageWords(u: UptimeIn, domain: string, n: number, dur: number): [string, string] {
  if (u.downNow) return [copy.stoppedAt(domain, u.since), copy.agoMin(u.minutesNow)]
  if (n === 1) return [copy.wasDownFor(domain, dur), copy.fromTo(u.incidents[0].from, u.incidents[0].to)]
  return [copy.wasDownTimes(domain, n), copy.inAll(dur)]
}

function uptimeCard(u: UptimeIn, domain: string): Story {
  const n = u.incidents.length
  const dur = Math.round(u.minutes)
  const [head, rest] = outageWords(u, domain, n, dur)
  return {
    key: 'uptime',
    score: u.downNow ? 100 : 88,
    bad: true,
    head,
    rest,
    vis: { k: 'outage', spans: u.spans, nowAt: u.nowAt, from: u.from, now: u.now },
    why: u.lost > 0 ? copy.noAnswer(people(Math.round(u.lost))) : copy.noAnswerBare,
    val: `${dur} min`,
    m: dur,
    u: 'min down',
    how: copy.downHow,
    ev: copy.incidentsEv(n, dur),
    act: { k: 'x', t: copy.openIncident },
    cause: whyDown({ domain, cause: u.cause, minutes: dur, ongoing: u.downNow }),
    deeper: { kind: 'incidents' },
  }
}

const sourceRest = (up: boolean, r: number, low: boolean): string => {
  if (!up) return ', far below usual'
  return r >= 1.5 && !low ? `, ${mult(r)} your usual` : ''
}

/** The source that rose furthest above its usual, when there is one: it leads the headline and the first card. */
export function leadSource(list: Slice[], total: number, domain: string): (Slice & { st: Judged }) | undefined {
  const self = (s: Slice) => !s.value || s.value.replace(/^www\./, '') === domain.replace(/^www\./, '')
  return movers(list, total, self).sort((a, b) => Math.abs(b.v - (b.band?.c ?? 0)) - Math.abs(a.v - (a.band?.c ?? 0)))[0]
}

/** A referrer that is one of the AI assistants: its card goes deeper into the AI & Search dialog. */
const isAssistant = (referrer: string): boolean => assistantOf(referrer) !== referrer

function sourceCard(s: Slice & { st: Judged }, i: CardsIn, total: number, topPage?: { name: string; value: string }): Story {
  const why = s.st === 'up' && s.band ? whyJump({ name: sourceName(s.value), host: s.value, now: s.v, lo: s.band.lo, hi: s.band.hi, mention: i.mention, page: topPage?.name }) : undefined
  const up = s.st === 'up'
  const b = s.band as Band
  const name = sourceName(s.value)
  const r = b.c > 0.5 ? s.v / b.c : 0
  const link = `https://${i.domain}${topPage?.value ?? '/'}?ref=${encodeURIComponent(name.toLowerCase().replace(/\s+/g, ''))}`
  const per = Math.max(1, Math.ceil(s.v / 60))
  const leave = s.bounce !== undefined ? Math.round(s.bounce * 100) : null
  return {
    key: 'sources',
    tag: name,
    score: (up ? 80 : 77) + Math.min(9, Math.log2(1 + (Math.abs(s.v - b.c) / Math.max(1, total)) * 20)),
    bad: !up,
    head: up ? copy.sent(name, people(Math.round(s.v))) : copy.sentOnly(name, people(Math.round(s.v))),
    ask: copy.askSource(name, up),
    rest: sourceRest(up, r, i.low),
    vis: up ? { k: 'dots', n: Math.max(1, Math.round(s.v / per)), per, grey: Math.min(Math.max(1, Math.round(s.v / per)), Math.round(b.c / per)), name } : { k: 'ba', lo: b.lo, hi: b.hi, c: b.c, v: s.v, red: true },
    why: `${copy.usually(rg(b), name)}${topPage ? copy.mostLanded(topPage.name) : ''}${up && !i.low && leave !== null ? copy.leave(leave) : ''}.`,
    val: fmtInt(Math.round(s.v)),
    m: s.v,
    u: 'people',
    how: `${i.rule} ${copy.sourceKnow}`,
    ev: evidence(s.v, b),
    act: up ? { k: 'copy', t: copy.shareLink, text: link, done: copy.linkCopied } : { k: 'set', t: copy.setAlert, msg: copy.alertDrops(name, fmtInt(Math.round(b.lo))) },
    cause: why,
    deeper: isAssistant(s.value) ? { kind: 'ai' } : { kind: 'explore', filter: { dim: 'referrer', value: s.value } },
  }
}

function countryCard(s: Slice & { st: Judged }, i: CardsIn, total: number, src?: string): Story {
  const up = s.st === 'up'
  const b = s.band as Band
  const name = countryName(s.value)
  return {
    key: 'countries',
    tag: name,
    score: 55 + Math.min(8, (Math.abs(s.v - b.c) / Math.max(1, total)) * 40),
    bad: !up,
    head: `${flag(s.value)} ${people(Math.round(s.v))} from ${name}`,
    rest: `, ${up ? 'more' : 'fewer'} than usual`,
    ask: copy.askCountry(name, up),
    vis: null,
    why: `${src ? copy.sendsMost(src) : ''}${copy.usuallyFromCountry(rg(b), name)}`,
    val: fmtInt(Math.round(s.v)),
    m: s.v,
    u: 'people',
    how: `${i.rule} ${copy.countryKnow}`,
    ev: evidence(s.v, b),
    act: { k: 'set', t: copy.setAlert, msg: copy.alertMoves(name, rg(b)) },
    deeper: { kind: 'explore', filter: { dim: 'country', value: s.value } },
    kc: { flag: flag(s.value), label: name, note: up ? copy.moreThanUsual : copy.fewerThanUsual, tone: up ? 'up' : 'dn', filter: { dim: 'country', value: s.value } },
  }
}

function deviceCard(s: Slice & { st: Judged }, i: CardsIn, total: number): Story {
  const up = s.st === 'up'
  const b = s.band as Band
  return {
    key: 'devices',
    tag: s.name,
    score: 50,
    bad: !up,
    head: copy.devicesAre(s.name, up),
    ask: copy.askDevice(s.name, up),
    rest: `: ${people(Math.round(s.v))}`,
    vis: { k: 'ba', lo: b.lo, hi: b.hi, c: b.c, v: s.v, red: !up },
    why: `${i.low ? '' : `${Math.round((s.v / Math.max(1, total)) * 100)}% of everyone; `}usually ${rg(b)} people.`,
    val: fmtInt(Math.round(s.v)),
    m: s.v,
    u: 'people',
    how: `${i.rule} ${copy.deviceKnow}`,
    ev: evidence(s.v, b),
    act: up
      ? { k: 'set', t: copy.setAlert, msg: copy.alertDevice(s.name) }
      : { k: 'copy', t: copy.fixPrompt, text: copy.devicePrompt(i.domain, s.name, fmtInt(Math.round(s.v)), rg(b)), done: copy.fixCopied },
    deeper: { kind: 'explore', filter: { dim: 'device', value: s.value } },
  }
}

function pageCard(s: Slice & { st: Judged }, i: CardsIn): Story {
  const up = s.st === 'up'
  const b = s.band as Band
  return {
    key: 'pages',
    tag: s.name,
    score: 52,
    bad: !up,
    head: `${s.name} ${up ? 'is getting more readers' : 'lost readers'}`,
    ask: copy.askPage(s.name, up),
    rest: `: ${people(Math.round(s.v))}`,
    vis: { k: 'ba', lo: b.lo, hi: b.hi, c: b.c, v: s.v, red: !up },
    why: copy.usuallyRead(rg(b)),
    val: fmtInt(Math.round(s.v)),
    m: s.v,
    u: 'people',
    how: `${i.rule} ${copy.pageKnow}`,
    ev: evidence(s.v, b),
    act: { k: 'goal', t: copy.addGoal, msg: copy.goalAdded(s.name), page: s.value },
    deeper: { kind: 'explore', filter: { dim: 'entry_page', value: s.value } },
  }
}

/** How far a goal stands from the middle of its usual, in whole percent; none when that middle is too small to say. */
const goalPct = (v: number, c: number): number | null => (c >= 1 ? Math.round(((v - c) / c) * 100) : null)

const goalWhen = (unit: Unit): string => ({ today: copy.goalToday, yesterday: copy.goalYesterday, week: copy.goalPeriod, month: copy.goalPeriod, range: copy.goalPeriod })[unit]

function goalHead(name: string, up: boolean, pct: number | null): string {
  if (pct === null) return up ? copy.goalAbove(name) : copy.goalBelow(name)
  return up ? copy.goalUp(name, Math.abs(pct)) : copy.goalDown(name, Math.abs(pct))
}

function goalAsk(name: string, up: boolean, pct: number | null, when: string): string {
  if (pct === null) return up ? copy.goalAskAbove(name, when) : copy.goalAskBelow(name, when)
  return up ? copy.goalAskUp(name, Math.abs(pct), when) : copy.goalAskDown(name, Math.abs(pct), when)
}

function goalCard(i: CardsIn): Story | null {
  const rows = i.goals
    .flatMap((g) => {
      const band = g.band
      const st = band ? judge(g.v, band) : ''
      return band && st ? [{ row: { name: g.name.replace(/^./, (x) => x.toUpperCase()), v: g.v, lo: band.lo, hi: band.hi, st, pct: goalPct(g.v, band.c) }, far: Math.abs(g.v - band.c) / Math.max(1, band.c) }] : []
    })
    .sort((a, b) => b.far - a.far)
    .map((x) => x.row)
  if (!rows.length) return null
  const g = rows[0]
  const up = g.st === 'up'
  const range = `${fmtInt(Math.max(0, Math.round(g.lo)))}–${fmtInt(Math.round(g.hi))}`
  return {
    key: 'goals',
    score: 45,
    bad: rows.some((x) => x.st === 'dn'),
    head: goalHead(g.name, up, g.pct),
    vis: { k: 'goals', rows },
    why: g.hi >= 1 ? copy.goalSub(fmtInt(Math.round(g.v)), goalWhen(i.unit), range) : copy.goalSubBare(fmtInt(Math.round(g.v)), goalWhen(i.unit)),
    ask: goalAsk(g.name, up, g.pct, goalWhen(i.unit)),
    val: fmtInt(Math.round(g.v)),
    m: g.v,
    u: 'people',
    how: `${i.rule} ${copy.goalKnow}`,
    ev: evidence(g.v, { c: 0, lo: g.lo, hi: g.hi }),
    act: { k: 'set', t: copy.alertNext, msg: copy.alertLeaves(g.name) },
    deeper: { kind: 'explore', filter: { dim: 'goal', value: i.goals.find((x) => x.name === g.name)?.value ?? '' } },
  }
}

function speedWords(n: number, i: number): string {
  if (i === 0) return `${fmtFixed(n, 1)} s`
  return i === 1 ? `${Math.round(n)} ms` : fmtFixed(n, 2)
}

/** Who changed: the one source, country, device or page that moved most, with the others that moved named under it (not a card each). */
function whoChanged(i: CardsIn, total: number): Story | null {
  const src = leadSource(i.slices.referrer, total, i.domain)
  const cty = movers(i.slices.country, total)[0]
  const dev = movers(i.slices.device, total)[0]
  const page = movers(i.slices.entry_page, total)[0]
  const moved = [src && sourceCard(src, i, total, i.topPageOf?.(src.value)), cty && countryCard(cty, i, total, i.topSourceOf?.(cty.value)), dev && deviceCard(dev, i, total), page && pageCard(page, i)].flatMap((s) => (s ? [s] : []))
  if (!moved.length) return null
  const [lead, ...rest] = moved.sort((a, b) => b.score - a.score)
  return rest.length ? { ...lead, also: rest.map((s) => ({ key: s.key, name: s.tag ?? s.head })) } : lead
}

/** The cards of the period, most worth reading first. A site that is not answering has one card only. */
export function cardsOf(i: CardsIn): Story[] {
  const out: Story[] = []
  const total = Math.max(1, i.cur.kpis.visitors)
  const u = i.uptime
  if (u.downNow || u.minutes > 0) out.push(uptimeCard(u, i.domain))
  if (u.downNow) return out
  if (!i.learning) {
    const lead = whoChanged(i, total)
    if (lead) out.push(lead)
    const goal = goalCard(i)
    if (goal) out.push(goal)
    if (i.sales) out.push(...salesCards(i.sales))
    const first = i.first && i.sales ? firstCard({ first: i.first, band: i.slices.country.find((x) => x.value === i.first?.country)?.band ?? null, fmt: i.sales.fmt, clock: i.sales.clock, rule: i.rule }) : null
    if (first) out.push(first)
    const leak = i.funnel && !i.low ? leakCard({ f: i.funnel, domain: i.domain, rule: i.rule }) : null
    const stuck = i.stuck && !i.low ? stuckCard(i.stuck, i.rule) : null
    // A page people are stuck on is part of where the path leaks: one card, the steps with the page named under them.
    if (leak) out.push(stuck && i.stuck ? withStuck(leak, i.stuck) : leak)
    const found = i.search ? searchCard({ story: i.search, domain: i.domain, rule: i.rule }) : null
    if (found) out.push(found)
    if (stuck && !leak) out.push(stuck)
  }
  if (i.mention) {
    const m = i.mention
    out.push({
      key: 'mentions',
      score: 71,
      head: copy.newMention(m.host),
      rest: `: “${m.title}”`,
      vis: { k: 'rcpt', rows: [{ l: m.title, t: m.at, a: `▲ ${m.points}` }, { l: copy.commentsSoFar, a: String(m.comments) }] },
      why: copy.followLand(m.page),
      val: `▲ ${m.points}`,
      m: m.points,
      u: 'points',
      how: copy.mentionHow,
      ev: copy.mentionEv(m.points, m.comments, m.at),
      act: { k: 'set', t: copy.alertMentions, msg: copy.alertMentionsMsg(i.domain) },
      deeper: { kind: 'mentions' },
    })
  }
  if (i.speed && i.speed.cur[0] > i.speed.usual[0] * 1.2) {
    const [c, w] = [i.speed.cur, i.speed.usual]
    out.push({
      key: 'speed',
      score: 68,
      bad: true,
      head: copy.slower,
      rest: `: loading takes ${speedWords(c[0], 0)}, usually ${speedWords(w[0], 0)}`,
      vis: { k: 'rcpt', rows: copy.vitalNames.map((n, k) => ({ l: n, t: `usual ${speedWords(w[k], k)}`, a: speedWords(c[k], k) })) },
      why: copy.slowWhy,
      val: speedWords(c[0], 0),
      m: c[0],
      u: 's',
      how: `${copy.vitalsHow} ${i.rule}`,
      ev: copy.speedEv(speedWords(c[0], 0), speedWords(w[0], 0)),
      act: { k: 'set', t: copy.alertMe, msg: copy.alertSlow },
      extra: { k: 'copy', t: copy.speedPrompt, text: copy.speedPromptText(i.domain, speedWords(c[0], 0), speedWords(w[0], 0)), done: copy.speedCopied },
      ask: copy.speedAsk(speedWords(c[0], 0), speedWords(w[0], 0)),
      deeper: { kind: 'speed' },
    })
  }
  // Problems before wins, then the bigger change.
  return out.sort((a, b) => Number(!!b.bad) - Number(!!a.bad) || b.score - a.score)
}

/** The topics a card does not cover, said as "everything else was normal: devices, pages". */
export function calmTopics(cards: Story[], search: boolean): string[] {
  const has = (t: Topic) => cards.some((c) => c.key === t || c.also?.some((a) => a.key === t))
  return (['sources', 'search', 'devices', 'countries', 'pages', 'goals'] as const).filter((t) => (t !== 'search' || search) && !(t !== 'search' && has(t))).map((t) => copy.topicNames[t])
}

export type { Row }
