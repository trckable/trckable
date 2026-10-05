// The Story view's sentences, by rules only: the headline, the four tiles'
// verdicts and the five answers, each built from numbers in the report and
// from nothing else. "Normal" is the period before, until the site has a
// normal of its own. Pure: rules.test.ts.
import type { Filter, Result, Row } from '../../lib/api'
import { fmtDuration, fmtInt, fmtPct } from '../../lib/format'
import { channelLabel } from '../../lib/palette'
import { copy } from './copy'

export type Tone = 'good' | 'warn' | 'bad' | 'flat'
export type StoryState = 'new' | 'quiet' | 'moving'
export type QuestionKey = keyof typeof copy.q

export interface Headline {
  /** The sentence in three parts: the figure in the middle is the one set apart. */
  pre: string
  strong: string
  post: string
  /** One line under it, when there is one to say. */
  note?: string
}

export interface Tile {
  key: 'visitors' | 'bounce' | 'session' | 'revenue'
  label: string
  value: string
  tone: Tone
  verdict: string
  /** No revenue is counted: the tile offers to connect a provider. */
  connect?: boolean
}

export interface Answer {
  key: QuestionKey
  question: string
  line: string
  sub: string
  /** fix: set apart; none: said quietly. */
  look: 'plain' | 'fix' | 'quiet'
  /** The button: switches to Explore with these filters. */
  act?: { label: string; filters: Filter[]; compare?: boolean }
  /** The answer offers to connect a provider or count a goal instead. */
  connect?: boolean
}

export interface StoryFacts {
  state: StoryState
  headline: Headline
  tiles: Tile[]
  answers: Answer[]
  /** The checklist of a new site: what is done and what is not. */
  steps: { text: string; done: boolean }[]
}

export interface Input {
  cur: Result
  prev?: Result
  /** Writes an amount; only given where revenue may be shown. */
  money?: (minor: number) => string
  /** Whether the site counts anything as a goal or a sale. */
  goals: boolean
}

/** Fewer visitors than this, with nothing before: the site is new. */
export const NEW_BELOW = 30
/** A change this small is inside the normal. */
const SAME = 0.1
/** A change this big is far from it. */
const FAR = 1

const hasPrev = (i: Input) => !!i.prev && i.prev.kpis.sessions > 0
/** The period before's numbers, when there was one with visits. */
const earlier = (i: Input) => (hasPrev(i) ? i.prev?.kpis : undefined)
const rate = (r: Row) => r.bounce_rate ?? 0

/** How far a number is from its period before, as a share of that period. */
const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : 0)

const channels = (r: Result): Row[] => r.dims.channel ?? []
const named = (v: string) => channelLabel(v)

export function stateOf(i: Input): StoryState {
  const v = i.cur.kpis.visitors
  if (!hasPrev(i) && v < NEW_BELOW) return 'new'
  const p = earlier(i)
  if (p && Math.abs(change(v, p.visitors)) < SAME) return 'quiet'
  return 'moving'
}

/** The channel that lost the most visitors against the period before, if any lost. */
export function biggestLoss(i: Input): Row | undefined {
  if (!i.prev) return undefined
  const was = new Map(channels(i.prev).map((r) => [r.value, r.visitors]))
  let worst: Row | undefined
  let drop = 0
  for (const r of channels(i.cur)) {
    const d = (was.get(r.value) ?? 0) - r.visitors
    if (d > drop) [worst, drop] = [r, d]
  }
  // A channel that had visitors and has none now is not in the current rows.
  for (const [value, n] of was) {
    if (channels(i.cur).some((r) => r.value === value)) continue
    if (n > drop) [worst, drop] = [{ value, visitors: 0 }, n]
  }
  return worst
}

/** What is worst among the key numbers, in words, or none: a high bounce rate first, then a shorter stay. */
function worstWord(i: Input): string | undefined {
  const k = i.cur.kpis
  if (k.sessions > 0 && k.bounce_rate >= 0.65) return copy.oneThenGo
  const p = earlier(i)
  if (p && p.avg_session_s > 0 && change(k.avg_session_s, p.avg_session_s) <= -0.2) return copy.shorter
  return undefined
}

export function headline(i: Input, state: StoryState): Headline {
  const k = i.cur.kpis
  const top = channels(i.cur)[0]
  const share = top && k.visitors > 0 ? fmtPct(top.visitors / k.visitors) : ''
  const who = copy.people(fmtInt(k.visitors))
  if (state === 'new') return { pre: copy.newLead, strong: copy.visitorsN(k.visitors), post: copy.newRest, note: copy.newNote }
  if (state === 'quiet') return { pre: copy.quietLead, strong: who, post: copy.quietRest(fmtInt(earlier(i)?.visitors ?? 0)), note: top ? copy.quietNote(named(top.value), share) : undefined }
  const worst = worstWord(i)
  const d = change(k.visitors, i.prev?.kpis.visitors ?? 0)
  if (hasPrev(i) && d < 0) {
    const loss = biggestLoss(i)
    return { pre: '', strong: who, post: copy.came + copy.fellBy(fmtPct(Math.abs(d))) + (loss ? copy.fellFrom(named(loss.value)) : '') + '.' + (worst ? copy.butAfter(worst) + '.' : '') }
  }
  const more = hasPrev(i) ? copy.grewBy(fmtPct(d)) : ''
  const from = top && share ? copy.topSource(named(top.value), share) : ''
  return { pre: '', strong: who, post: copy.came + more + from + (worst ? copy.but(worst) : '') + '.' }
}

/** One tile's words: how far a number is from its period before. */
function verdictOf(d: number, before: string, say: { farAbove: (b: string) => string; above: (b: string) => string; inside: (b: string) => string; below: (b: string) => string; farBelow: (b: string) => string }) {
  if (d >= FAR) return { tone: 'good' as Tone, verdict: say.farAbove(before) }
  if (d >= SAME) return { tone: 'good' as Tone, verdict: say.above(before) }
  if (d <= -0.5) return { tone: 'bad' as Tone, verdict: say.farBelow(before) }
  if (d <= -SAME) return { tone: 'bad' as Tone, verdict: say.below(before) }
  return { tone: 'flat' as Tone, verdict: say.inside(before) }
}

export function tiles(i: Input): Tile[] {
  const k = i.cur.kpis
  const p = earlier(i)
  const out: Tile[] = []
  const none = { tone: 'flat' as Tone, verdict: copy.noBefore }

  const v = p ? verdictOf(change(k.visitors, p.visitors), fmtInt(p.visitors), copy) : none
  out.push({ key: 'visitors', label: copy.visitors, value: fmtInt(k.visitors), ...v })

  let b: Pick<Tile, 'tone' | 'verdict'> = none
  const pts = p ? k.bounce_rate - p.bounce_rate : 0
  if (k.bounce_rate >= 0.7) b = { tone: 'warn', verdict: copy.bounceHigh(Math.round(k.bounce_rate * 10)) }
  else if (p && pts >= 0.05) b = { tone: 'warn', verdict: copy.bounceWorse(fmtPct(p.bounce_rate)) }
  else if (p && pts <= -0.05) b = { tone: 'good', verdict: copy.bounceBetter(fmtPct(p.bounce_rate)) }
  else if (p) b = { tone: 'flat', verdict: copy.bounceSame(fmtPct(p.bounce_rate)) }
  out.push({ key: 'bounce', label: copy.bounce, value: fmtPct(k.bounce_rate), ...b })

  let s: Pick<Tile, 'tone' | 'verdict'> = none
  if (p && p.avg_session_s > 0) {
    const d = change(k.avg_session_s, p.avg_session_s)
    const before = fmtDuration(p.avg_session_s)
    if (d >= 0.15) s = { tone: 'good', verdict: copy.timeLonger(before) }
    else if (d <= -0.15) s = { tone: 'warn', verdict: copy.timeShorter(before) }
    else s = { tone: 'flat', verdict: copy.timeSame(before) }
  }
  out.push({ key: 'session', label: copy.session, value: fmtDuration(k.avg_session_s), ...s })

  const m = i.cur.money
  if (!i.money || !m) {
    out.push({ key: 'revenue', label: copy.revenue, value: copy.notCounted, tone: 'flat', verdict: copy.connect, connect: true })
  } else {
    const pm = hasPrev(i) ? i.prev?.money : undefined
    const r = pm && pm.revenue > 0 ? verdictOf(change(m.revenue, pm.revenue), i.money(pm.revenue), copy) : none
    out.push({ key: 'revenue', label: copy.revenue, value: i.money(m.revenue), ...r })
  }
  return out
}

/** The source whose visitors leave soonest: among those that bring a real share, the highest bounce rate, when it is high on its own or well above the rest. */
export function leavesFastest(i: Input): { worst: Row; best?: Row } | undefined {
  const total = i.cur.kpis.visitors
  const rows = channels(i.cur).filter((r) => r.bounce_rate !== undefined && r.visitors >= Math.max(5, total * 0.05))
  if (rows.length === 0) return undefined
  const sorted = [...rows].sort((a, b) => rate(b) - rate(a))
  const worst = sorted[0]
  const best = sorted.length > 1 ? sorted[sorted.length - 1] : undefined
  const high = rate(worst) >= 0.7
  const apart = !!best && rate(worst) - rate(best) >= 0.15 && rate(worst) >= 0.5
  return high || apart ? { worst, best: best && best.value !== worst.value ? best : undefined } : undefined
}

function did(i: Input): Answer {
  const k = i.cur.kpis
  const top = channels(i.cur)[0]
  const share = top && k.visitors > 0 ? fmtPct(top.visitors / k.visitors) : ''
  const act = top ? { label: copy.didAct(named(top.value)), filters: [{ dim: 'channel', value: top.value }] } : undefined
  const sub = top ? copy.didSub(fmtInt(top.visitors), share, named(top.value)) : ''
  if (!hasPrev(i)) return { key: 'did', question: copy.q.did, line: copy.didEarly(fmtInt(k.visitors)), sub, look: 'plain', act }
  const was = earlier(i)?.visitors ?? 0
  const d = change(k.visitors, was)
  if (d >= SAME) return { key: 'did', question: copy.q.did, line: copy.didYes(fmtInt(was), fmtInt(k.visitors)), sub, look: 'plain', act }
  if (d <= -SAME) return { key: 'did', question: copy.q.did, line: copy.didNo(fmtInt(was), fmtInt(k.visitors)), sub, look: 'plain', act }
  return { key: 'did', question: copy.q.did, line: copy.didSame(fmtInt(was), fmtInt(k.visitors)), sub, look: 'plain', act }
}

function page(i: Input): Answer {
  const row = (i.cur.dims.entry_page ?? [])[0]
  const total = i.cur.kpis.visitors
  if (!row || total === 0) return { key: 'page', question: copy.q.page, line: copy.pageNone, sub: copy.pageNoneSub, look: 'quiet' }
  return {
    key: 'page', question: copy.q.page, look: 'plain',
    line: copy.pageTitle(row.value, fmtPct(Math.min(1, row.visitors / total))),
    sub: copy.pageSub(fmtInt(row.visitors)),
    act: { label: copy.pageAct, filters: [{ dim: 'entry_page', value: row.value }] },
  }
}

function fix(i: Input): Answer {
  const f = leavesFastest(i)
  if (!f) return { key: 'fix', question: copy.q.fix, line: copy.fixNone, sub: copy.fixNoneSub, look: 'quiet' }
  const n = Math.round(f.worst.visitors * rate(f.worst))
  return {
    key: 'fix', question: copy.q.fix, look: 'fix',
    line: copy.fixTitle(named(f.worst.value), fmtPct(rate(f.worst))),
    sub: f.best ? copy.fixSub(fmtInt(n), named(f.best.value), fmtPct(rate(f.best))) : copy.fixSubAlone(fmtInt(n)),
    act: { label: copy.fixAct, filters: [{ dim: 'channel', value: f.worst.value }] },
  }
}

function pays(i: Input): Answer {
  const m = i.cur.money
  const rows = (i.cur.revenue_dims?.channel ?? []).filter((r) => (r.revenue ?? 0) > 0)
  if (i.money && m && m.revenue > 0 && rows.length > 0) {
    const top = [...rows].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))[0]
    return {
      key: 'pays', question: copy.q.pays, look: 'plain',
      line: copy.paysTitle(named(top.value), fmtPct(Math.min(1, (top.revenue ?? 0) / m.revenue))),
      sub: copy.paysSub(i.money(top.revenue ?? 0), i.money(m.revenue)),
      act: { label: copy.paysAct(named(top.value)), filters: [{ dim: 'channel', value: top.value }] },
    }
  }
  const goal = (i.cur.goals ?? [])[0]
  if (goal) {
    return {
      key: 'pays', question: copy.q.pays, look: 'plain', connect: true,
      line: copy.paysGoal(goal.value, fmtInt(goal.visitors)),
      sub: copy.paysGoalSub,
      act: { label: copy.paysGoalAct, filters: [{ dim: 'goal', value: goal.value }] },
    }
  }
  return { key: 'pays', question: copy.q.pays, line: copy.paysNone, sub: copy.paysNoneSub, look: 'quiet', connect: true }
}

function fine(i: Input): Answer {
  const act = { label: copy.fineAct, filters: [], compare: true }
  if (!hasPrev(i)) return { key: 'fine', question: copy.q.fine, line: copy.fineEarly, sub: copy.fineEarlySub, look: 'quiet' }
  const t = tiles(i).filter((x) => x.key !== 'revenue')
  const worse = t.filter((x) => x.tone === 'bad' || x.tone === 'warn').map((x) => x.label.toLowerCase())
  const better = t.some((x) => x.tone === 'good')
  let line = copy.fineSame
  if (worse.length === 0 && better) line = copy.fineGood
  if (worse.length > 0 && better) line = copy.fineMixed(worse.join(' and '))
  if (worse.length > 0 && !better) line = copy.fineBad(worse.join(' and '))
  return { key: 'fine', question: copy.q.fine, line, sub: copy.fineSub, look: 'plain', act }
}

export function storyOf(i: Input): StoryFacts {
  const state = stateOf(i)
  return {
    state,
    headline: headline(i, state),
    tiles: tiles(i),
    answers: [did(i), page(i), fix(i), pays(i), fine(i)],
    steps: [
      { text: copy.trackerOn, done: true },
      { text: i.goals ? copy.goalOn : copy.goalOff, done: i.goals },
    ],
  }
}
