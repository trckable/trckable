// What stood out, as cards, by the walkthrough's rules: each kind of change is looked for in the numbers (against the
// usual of that slice, never against nothing), written as one claim with the picture that proves it, a line of why, and
// one thing to do. The cards are ranked by how much they matter and how bad the news is. Pure: cards.test.ts.
import type { Result, Row } from '../../lib/api'
import { countryName, flag, fmtInt } from '../../lib/format'
import { copy } from './cards.copy'
import { mult, sourceName, type Deeper, type Unit } from './model'
import { judge, type Band, type Judged } from './usual'

export type Topic = 'uptime' | 'sources' | 'countries' | 'devices' | 'pages' | 'goals' | 'mentions' | 'speed' | 'milestone'
export type Dim = 'referrer' | 'country' | 'device' | 'entry_page'

/** The one thing a card offers to do. */
export type Act =
  | { k: 'copy'; t: string; text: string; done: string }
  | { k: 'set'; t: string; msg: string }
  | { k: 'goal'; t: string; msg: string; page: string }
  | { k: 'x'; t: string }

export type Vis =
  | { k: 'rcpt'; rows: { l: string; t?: string; a?: string; flag?: string; neg?: boolean }[] }
  | { k: 'dots'; n: number; per: number; grey: number; col: string; name: string }
  | { k: 'ba'; lo: number; hi: number; c: number; v: number; red: boolean }
  | { k: 'outage'; a: number; b: number; nowAt: number; from: string; now: string }
  | { k: 'goals'; rows: { name: string; v: number; lo: number; hi: number; st: Judged }[] }

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
  deeper: Deeper
  /** A card that is a number with a line (a country). */
  kc?: { flag: string; label: string; note: string; tone: 'up' | 'dn'; filter: { dim: string; value: string } }
  /** The source's own colour, for its dots. */
  col?: string
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
  /** Where the outage lies in the period, 0 to 1, and where now is. */
  a: number
  nowAt: number
  b: number
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
  /** The page most of a source's people landed on, and the source most of a country's came from. */
  topPageOf?: (referrer: string) => { name: string; value: string } | undefined
  topSourceOf?: (country: string) => string | undefined
  /** The rule that says what "usual" is, in words. */
  rule: string
  uptime: UptimeIn
  mention?: { host: string; title: string; at: string; points: number; comments: number; page: string }
  speed?: { cur: [number, number, number]; usual: [number, number, number] }
}

const people = (n: number) => (n === 1 ? '1 person' : `${fmtInt(n)} people`)
const rg = (b: Band) => `${fmtInt(Math.max(0, b.lo))}–${fmtInt(b.hi)}`
const evidence = (v: number, b: Band) => `Now ${fmtInt(v)}, usual ${fmtInt(Math.max(0, b.lo))} to ${fmtInt(b.hi)}.`
const SOURCE_COLOR: Record<string, string> = {
  'Hacker News': '#ff9a4a',
  Google: '#7f9cf5',
  Reddit: '#ff6b4a',
  X: '#d7dadf',
  GitHub: '#b58cff',
  ChatGPT: '#3fd0b0',
  Newsletter: '#c6ff3a',
}
export const sourceColor = (name: string): string => SOURCE_COLOR[name] ?? '#8b8e94'

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
    vis: { k: 'outage', a: u.a, b: u.b, nowAt: u.nowAt, from: '00:00', now: u.now },
    why: u.lost > 0 ? copy.noAnswer(people(Math.round(u.lost))) : copy.noAnswerBare,
    val: `${dur} min`,
    m: dur,
    u: 'min down',
    how: copy.downHow,
    ev: copy.incidentsEv(n, dur),
    act: { k: 'x', t: copy.openIncident },
    deeper: { kind: 'incidents' },
  }
}

const sourceRest = (up: boolean, r: number, low: boolean): string => {
  if (!up) return ', far below usual'
  return r >= 1.5 && !low ? `, ${mult(r)} your usual` : ''
}

function sourceCard(s: Slice & { st: Judged }, i: CardsIn, total: number, topPage?: { name: string; value: string }): Story {
  const up = s.st === 'up'
  const b = s.band as Band
  const name = sourceName(s.value)
  const r = b.c > 0.5 ? s.v / b.c : 0
  const link = `https://${i.domain}${topPage?.value ?? '/'}?ref=${encodeURIComponent(name.toLowerCase().replace(/\s+/g, ''))}`
  const per = Math.max(1, Math.ceil(s.v / 60))
  const leave = s.bounce !== undefined ? Math.round(s.bounce * 100) : null
  return {
    key: 'sources',
    score: (up ? 80 : 77) + Math.min(9, Math.log2(1 + (Math.abs(s.v - b.c) / Math.max(1, total)) * 20)),
    bad: !up,
    head: up ? copy.sent(name, people(Math.round(s.v))) : copy.sentOnly(name, people(Math.round(s.v))),
    rest: sourceRest(up, r, i.low),
    vis: up ? { k: 'dots', n: Math.max(1, Math.round(s.v / per)), per, grey: Math.min(Math.max(1, Math.round(s.v / per)), Math.round(b.c / per)), col: sourceColor(name), name } : { k: 'ba', lo: b.lo, hi: b.hi, c: b.c, v: s.v, red: true },
    why: `${copy.usually(rg(b), name)}${topPage ? copy.mostLanded(topPage.name) : ''}${up && !i.low && leave !== null ? copy.leave(leave) : ''}.`,
    val: fmtInt(Math.round(s.v)),
    m: s.v,
    u: 'people',
    how: `${i.rule} ${copy.sourceKnow}`,
    ev: evidence(s.v, b),
    act: up ? { k: 'copy', t: copy.shareLink, text: link, done: copy.linkCopied } : { k: 'set', t: copy.setAlert, msg: copy.alertDrops(name, fmtInt(Math.round(b.lo))) },
    deeper: { kind: 'explore', filter: { dim: 'referrer', value: s.value } },
    col: sourceColor(name),
  }
}

function countryCard(s: Slice & { st: Judged }, i: CardsIn, total: number, src?: string): Story {
  const up = s.st === 'up'
  const b = s.band as Band
  const name = countryName(s.value)
  return {
    key: 'countries',
    score: 55 + Math.min(8, (Math.abs(s.v - b.c) / Math.max(1, total)) * 40),
    bad: !up,
    head: `${flag(s.value)} ${people(Math.round(s.v))} from ${name}`,
    rest: `, ${up ? 'more' : 'fewer'} than usual`,
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
    score: 50,
    bad: !up,
    head: copy.devicesAre(s.name, up),
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
    score: 52,
    bad: !up,
    head: `${s.name} ${up ? 'is getting more readers' : 'lost readers'}`,
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

function goalCard(i: CardsIn, prev: Result | undefined): Story | null {
  const goals = (i.cur.goals ?? []).flatMap((g) => {
    const was = prev?.goals?.find((x) => x.value === g.value)?.visitors
    if (was === undefined || was < 3) return []
    const c = was
    const band = { c, lo: Math.max(0, c * 0.75 - 1), hi: c * 1.25 + 1 }
    const st = judge(g.visitors, band)
    return st ? [{ name: (g.label || g.value).replace(/^./, (x) => x.toUpperCase()), v: g.visitors, lo: band.lo, hi: band.hi, st }] : []
  })
  if (!goals.length) return null
  const g = goals[0]
  return {
    key: 'goals',
    score: 45,
    bad: goals.some((x) => x.st === 'dn'),
    head: `${g.name} is ${g.st === 'up' ? 'up' : 'down'}`,
    rest: `: ${people(Math.round(g.v))}${goals.length > 1 ? `, and ${goals.length - 1} more goal${goals.length > 2 ? 's' : ''}` : ''}`,
    vis: { k: 'goals', rows: goals },
    why: copy.goalsWhy,
    val: fmtInt(Math.round(g.v)),
    m: g.v,
    u: 'people',
    how: `${i.rule} ${copy.goalKnow}`,
    ev: evidence(g.v, { c: 0, lo: g.lo, hi: g.hi }),
    act: { k: 'set', t: copy.setAlert, msg: copy.alertLeaves(g.name) },
    deeper: { kind: 'explore', filter: { dim: 'goal', value: (i.cur.goals ?? [])[0]?.value ?? '' } },
  }
}

function speedWords(n: number, i: number): string {
  if (i === 0) return `${n.toFixed(1)} s`
  return i === 1 ? `${Math.round(n)} ms` : n.toFixed(2)
}

/** The cards of the period, most worth reading first. A site that is not answering has one card only. */
export function cardsOf(i: CardsIn): Story[] {
  const out: Story[] = []
  const total = Math.max(1, i.cur.kpis.visitors)
  const u = i.uptime
  if (u.downNow || u.minutes > 0) out.push(uptimeCard(u, i.domain))
  if (u.downNow) return out
  if (!i.learning) {
    const src = movers(i.slices.referrer, total, (s) => !s.value || s.value.replace(/^www\./, '') === i.domain.replace(/^www\./, '')).sort((a, b) => Math.abs(b.v - (b.band?.c ?? 0)) - Math.abs(a.v - (a.band?.c ?? 0)))[0]
    if (src) out.push(sourceCard(src, i, total, i.topPageOf?.(src.value)))
    const cty = movers(i.slices.country, total)[0]
    if (cty) out.push(countryCard(cty, i, total, i.topSourceOf?.(cty.value)))
    const dev = movers(i.slices.device, total)[0]
    if (dev) out.push(deviceCard(dev, i, total))
    const page = movers(i.slices.entry_page, total)[0]
    if (page) out.push(pageCard(page, i))
    const goal = goalCard(i, i.prev)
    if (goal) out.push(goal)
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
      act: { k: 'copy', t: copy.speedPrompt, text: copy.speedPromptText(i.domain, speedWords(c[0], 0), speedWords(w[0], 0)), done: copy.speedCopied },
      deeper: { kind: 'speed' },
    })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** The topics a card does not cover, said as "everything else was normal: devices, pages". */
export function calmTopics(cards: Story[], search: boolean): string[] {
  const has = (t: Topic) => cards.some((c) => c.key === t)
  return (['sources', 'search', 'devices', 'countries', 'pages', 'goals'] as const).filter((t) => (t !== 'search' || search) && !(t !== 'search' && has(t))).map((t) => copy.topicNames[t])
}

export type { Row }
