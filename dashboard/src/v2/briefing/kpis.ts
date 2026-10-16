// The four numbers under the hero, as the walkthrough builds them: People, the goal (or pageviews), Uptime, and
// what people paid (or how many left after one page). Pure: kpis.test.ts.
import type { Result } from '../../lib/api'
import { delta, fmtCompact, fmtInt, fmtPct } from '../../lib/format'
import { tooFew } from '../../lib/thin'
import type { Kc } from '../ui/KpiCard'
import { copy } from './copy'
import type { Score } from './model'
import type { Judged } from './usual'

/** "+27% vs usual", "as usual", "−6% vs the day before": the note on a number that has a figure to be told against. */
export function noteOf(now: number, was: number | undefined, before: string): Kc['note'] {
  const d = delta(now, was)
  if (!d || d.tone === 'flat') return { t: copy.asUsual }
  const pct = Math.round(Math.abs(((now - (was as number)) / (was as number)) * 100))
  return d.tone === 'up' ? { t: copy.vsBefore('+', pct, before), up: true } : { t: copy.vsBefore('−', pct, before), dn: true }
}

/** The note against the site's own usual: how far above or below it, or as usual. */
export function usualNote(v: number, c: number, st: Judged): Kc['note'] {
  if (c > 0.5 && st) {
    const p = Math.round((v / c - 1) * 100)
    return { t: copy.vsUsual(p >= 0 ? '+' : '−', Math.abs(p)), up: st === 'up', dn: st === 'dn' }
  }
  return { t: copy.asUsual }
}

export interface KpiIn {
  cur: Result
  prev?: Result
  learning: boolean
  before: string
  people: { note: Kc['note']; vals: number[] }
  /** The goal's own line, bucket by bucket (empty while it is read). */
  goal: { vals: number[] } | null
  viewsVals: number[]
  leave: { note: Kc['note']; vals: number[] }
  uptime: Score
  /** The uptime figure ("99.9") and its line, a bucket at a time. */
  uptimePct: string
  uptimeVals: number[]
  money?: (minor: number) => string
  moneyVals: number[]
}

export function kpiCards(a: KpiIn): Kc[] {
  const { cur, prev } = a
  const goal = (cur.goals ?? []).find((g) => g.visitors > 0)
  const down = a.uptime.verdict === 'down' || a.uptime.verdict === 'lost'
  const upNote: Kc['note'] = { t: a.uptime.verdict === 'clear' ? copy.noDowntime : a.uptime.words, dn: down }
  const thin = tooFew(cur.kpis.sessions)
  const cards: Kc[] = [
    { key: 'people', icon: 'people', label: copy.people, val: fmtInt(cur.kpis.visitors), note: a.learning ? { t: copy.learning } : a.people.note, vals: a.people.vals, dn: false },
    goal
      ? { key: 'goal', icon: 'goal', label: (goal.label || goal.value).replace(/^./, (c) => c.toUpperCase()), val: fmtInt(goal.visitors), note: a.learning ? { t: copy.learning } : noteOf(goal.visitors, prev?.goals?.find((g) => g.value === goal.value)?.visitors, a.before), vals: a.goal?.vals ?? [], col: '#7f9cf5' }
      : { key: 'views', icon: 'click', label: copy.views, val: fmtCompact(cur.kpis.pageviews), note: a.learning ? { t: copy.learning } : noteOf(cur.kpis.pageviews, prev?.kpis.pageviews, a.before), vals: a.viewsVals, col: '#7f9cf5' },
    { key: 'uptime', icon: 'uptime', label: copy.uptimeCard, val: a.uptime.value === null ? '–' : `${a.uptimePct}%`, note: upNote, vals: a.uptime.value === null ? [] : a.uptimeVals, lo: Math.min(90, ...a.uptimeVals), hi: Math.min(90, ...a.uptimeVals) + (100 - Math.min(90, ...a.uptimeVals)) * 1.7, dn: down },
    cur.money && a.money
      ? { key: 'money', icon: 'sales', label: copy.net(cur.money.payments), val: a.money(cur.money.revenue), note: a.learning ? { t: copy.soFarToday } : noteOf(cur.money.revenue, prev?.money?.revenue, a.before), vals: a.moneyVals }
      : { key: 'leave', icon: 'leave', label: copy.left, val: thin ? '–' : fmtPct(cur.kpis.bounce_rate), note: a.learning || thin ? { t: copy.soFarToday } : a.leave.note, vals: a.leave.vals, lo: 0, hi: Math.max(0.8, ...a.leave.vals), col: '#7f9cf5' },
  ]
  return cards
}

/** The note under "left after one page": higher or lower than the site usually sees, within a few points as usual. */
export function bounceNote(now: number, usual: number | null): Kc['note'] {
  const pct = Math.round(now * 100)
  if (usual !== null && pct > Math.round((usual + 0.04) * 100)) return { t: copy.higherThanUsual, dn: true }
  if (usual !== null && pct < Math.round((usual - 0.04) * 100)) return { t: copy.lowerThanUsual, up: true }
  return { t: copy.asUsual }
}

/** An uptime figure as the card writes it: whole when it is whole, one decimal otherwise, nothing without one. */
export function pctText(pct: number | null): string {
  if (pct === null) return ''
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1)
}
