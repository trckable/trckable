// The cards under the hero: the goal (or pageviews), Uptime, and what people paid. Visitors and bounce rate are
// in the numbers row above them, so they are not repeated here. Pure.
import { goalName } from '../../lib/goalName'
import type { Result } from '../../lib/api'
import { delta, fmtCompact, fmtFixed, fmtInt } from '../../lib/format'
import type { Kc } from '../ui/KpiCard'
import { copy } from './copy'
import { type Score } from './model'
import { judge, type Band as UsualBand, type Judged } from './usual'

/** "+27% vs usual", "as usual", "−6% vs the day before": the note on a number that has a figure to be told against. */
export function noteOf(now: number, was: number | undefined, before: string): Kc['note'] {
  const d = delta(now, was)
  if (!d || d.tone === 'flat') return { t: copy.asUsual }
  const pct = Math.round(Math.abs(((now - (was as number)) / (was as number)) * 100))
  return d.tone === 'up' ? { t: copy.vsBefore('+', pct, before), up: true } : { t: copy.vsBefore('−', pct, before), dn: true }
}

/** A figure against its own usual: how far above or below it, "as usual" inside the band, nothing to say without one. */
function bandNote(v: number, b: UsualBand | null | undefined): Kc['note'] | null {
  if (!b) return null
  const st = judge(v, b)
  if (b.c > 0.5 && st) return usualNote(v, b.c, st)
  return st === '' ? { t: copy.asUsual } : null
}

/** "usual 5–6 people": the range in numbers, for a site where a percentage says nothing. */
function rangeNote(v: number, b: UsualBand | null | undefined, unit: string): Kc['note'] {
  if (!b) return { t: copy.asUsual }
  const st = judge(v, b)
  return { t: `${copy.usualRange(fmtInt(Math.round(b.lo)), fmtInt(Math.round(b.hi)))}${unit}`, up: st === 'up', dn: st === 'dn' }
}

/** The note against the site's own usual: how far above or below it, or as usual. */
export function usualNote(v: number, c: number, st: Judged): Kc['note'] {
  if (c > 0.5 && st) {
    const p = Math.round((v / c - 1) * 100)
    return { t: copy.vsUsual(p >= 0 ? '+' : '−', Math.abs(p)), up: st === 'up', dn: st === 'dn' }
  }
  return { t: copy.asUsual }
}

interface KpiIn {
  cur: Result
  prev?: Result
  learning: boolean
  before: string
  /** The goal's own line, bucket by bucket (empty while it is read). */
  goal: { vals: number[] } | null
  viewsVals: number[]
  uptime: Score
  /** A site with few visitors: each card says its usual range in numbers. */
  low?: boolean
  /** The goal against its own usual, when the history says (else the period before is the measure). */
  goalBand?: UsualBand | null
  /** What the sales of the period are told against, when the history says. */
  moneyBand?: UsualBand | null
  /** The uptime figure ("99.9") and its line, a bucket at a time. */
  uptimePct: string
  uptimeVals: number[]
  money?: (minor: number) => string
  moneyVals: number[]
}

export function kpiCards(a: KpiIn): Kc[] {
  const { cur, prev } = a
  // The signup has its own figure in the numbers row: the card shows the next goal, or pageviews.
  const goal = (cur.goals ?? []).find((g) => g.visitors > 0 && g.value !== cur.signup?.goal)
  const down = a.uptime.verdict === 'down' || a.uptime.verdict === 'lost'
  const stale = a.uptime.verdict === 'down'
  const unknown: Kc['note'] = { t: copy.unknownNow }
  const upNote: Kc['note'] = { t: a.uptime.verdict === 'clear' ? copy.noDowntime : a.uptime.words, dn: down }
  const few = !!a.low && !a.learning
  // The note of a card: unknown while the site is down, in numbers for a quiet site, "learning" on the first days, else its own.
  const say = (f: Kc['note'], l: Kc['note'], b: Kc['note']): Kc['note'] => {
    if (stale) return unknown
    if (few) return f
    return a.learning ? l : b
  }
  const learning: Kc['note'] = { t: copy.learning }
  // An uptime nobody measured (a past day with no monitor data) is not a card with a dash: the card is left out.
  const unmeasured = a.uptime.value === null && !down && a.uptime.verdict !== 'paused'
  const cards: Kc[] = [
    goal
      ? { key: 'goal', icon: 'goal', label: goalName(goal.label, goal.value).replace(/^./, (c) => c.toUpperCase()), val: fmtInt(goal.visitors), note: say(rangeNote(goal.visitors, a.goalBand, ''), learning, bandNote(goal.visitors, a.goalBand) ?? noteOf(goal.visitors, prev?.goals?.find((g) => g.value === goal.value)?.visitors, a.before)), vals: a.goal?.vals ?? [], col: 'var(--mk-blue)' }
      : { key: 'views', icon: 'click', label: copy.views, val: fmtCompact(cur.kpis.pageviews), note: a.learning ? { t: copy.learning } : noteOf(cur.kpis.pageviews, prev?.kpis.pageviews, a.before), vals: a.viewsVals, col: 'var(--mk-blue)' },
    { key: 'uptime', icon: 'uptime', label: copy.uptimeCard, val: a.uptime.value === null ? '–' : `${a.uptimePct}%`, note: upNote, vals: a.uptime.value === null ? [] : a.uptimeVals, lo: Math.min(90, ...a.uptimeVals), hi: Math.min(90, ...a.uptimeVals) + (100 - Math.min(90, ...a.uptimeVals)) * 1.7, dn: down },
    ...(cur.money && a.money ? [{ key: 'money', icon: 'sales', label: copy.net(cur.money.payments), val: a.money(cur.money.revenue), note: a.learning ? { t: copy.soFarToday } : (bandNote(cur.money.revenue, a.moneyBand) ?? noteOf(cur.money.revenue, prev?.money?.revenue, a.before)), vals: a.moneyVals }] : []),
  ]
  return unmeasured ? cards.filter((c) => c.key !== 'uptime') : cards
}

/** An uptime figure as the card writes it: whole when it is whole, one decimal otherwise, nothing without one. */
export function pctText(pct: number | null): string {
  if (pct === null) return ''
  return Number.isInteger(pct) ? fmtInt(pct) : fmtFixed(pct, 1)
}
