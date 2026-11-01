// The numbers row under the Briefing's headline: the period's key figures, each with its change against the period before.
// Signup figures only when the site has a signup goal, money figures only when payments are connected. Pure: numbers.test.ts.
import type { Result } from '../../lib/api'
import { delta, fmtCompact, fmtDuration, fmtPct, fmtRatio, type Delta } from '../../lib/format'
import { baseEnough, tooFew } from '../../lib/thin'
import { copy } from './copy'

export interface Figure {
  key: 'visitors' | 'pageviews' | 'signups' | 'signupRate' | 'revenue' | 'conversion' | 'bounce' | 'session'
  label: string
  val: string
  /** The change against the period before; nothing when there is no base to measure it on. */
  change: Delta | null
}

/** A rate or an average, with its change; a dash while the period has too few visits to say. */
function rate(cur: Result, prev: Result | undefined, val: (r: Result) => number, text: (n: number) => string, invert = false): Pick<Figure, 'val' | 'change'> {
  if (tooFew(cur.kpis.sessions)) return { val: '–', change: null }
  const thinBase = !prev || tooFew(prev.kpis.sessions)
  return { val: text(val(cur)), change: thinBase ? null : delta(val(cur), val(prev), invert) }
}

export function figuresOf(cur: Result, prev: Result | undefined, money?: (minor: number) => string): Figure[] {
  const base = prev && baseEnough(prev.kpis.visitors) ? prev : undefined
  const out: Figure[] = [
    { key: 'visitors', label: copy.numVisitors, val: fmtCompact(cur.kpis.visitors), change: delta(cur.kpis.visitors, base?.kpis.visitors) },
    { key: 'pageviews', label: copy.numPageviews, val: fmtCompact(cur.kpis.pageviews), change: delta(cur.kpis.pageviews, base?.kpis.pageviews) },
  ]
  const su = cur.signup
  if (su) {
    const was = base?.signup
    const rateOf = (r: Result) => (r.signup && r.kpis.visitors > 0 ? r.signup.visitors / r.kpis.visitors : 0)
    out.push(
      { key: 'signups', label: copy.numSignups, val: fmtCompact(su.visitors), change: delta(su.visitors, was?.visitors) },
      { key: 'signupRate', label: copy.numSignupRate, ...rate(cur, base, rateOf, fmtPct) },
    )
  }
  const m = cur.money
  if (m && money) {
    const was = base?.money
    out.push(
      { key: 'revenue', label: copy.numRevenue, val: money(m.revenue), change: delta(m.revenue, was?.revenue) },
      { key: 'conversion', label: copy.numConversion, val: fmtRatio(m.conversion, 1), change: delta(m.conversion, was?.conversion) },
    )
  }
  out.push(
    { key: 'bounce', label: copy.numBounce, ...rate(cur, prev, (r) => r.kpis.bounce_rate, fmtPct, true) },
    { key: 'session', label: copy.numSession, ...rate(cur, prev, (r) => r.kpis.avg_session_s, fmtDuration) },
  )
  return out
}
