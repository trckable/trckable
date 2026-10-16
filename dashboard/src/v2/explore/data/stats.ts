// "Usual" for a number, by rules only: the same figure over the period before, with a quarter either way as the range it
// usually sits in (as the Briefing does). Under a base worth measuring against, nothing is said to be above or below.
// Pure: stats.test.ts.
import type { Row as ApiRow } from '../../../lib/api'
import { baseEnough } from '../../../lib/thin'
import type { Row, Stat, Tone } from '../types'

export const FLOOR = 5

/** Where a number is against its usual: the range and which side of it it is on. */
export function statOf(v: number, was: number | undefined, base = true): Stat {
  const c = was ?? 0
  const lo = Math.max(0, Math.floor(c * 0.75))
  const hi = Math.ceil(c * 1.25) + 1
  const side = (): Tone => {
    if (v > hi) return 'up'
    return v < lo ? 'dn' : ''
  }
  return { v, c, lo, hi, st: !base || (v < FLOOR && c < FLOOR) ? '' : side() }
}

/** A table's rows: each against the same row of the period before. A period before that was too thin says nothing. */
export function rowsOf(cur: ApiRow[] | null | undefined, prev: ApiRow[] | null | undefined, before: number | undefined, name: (value: string) => string, extra?: (value: string) => Partial<Row>): Row[] {
  const base = prev != null && baseEnough(before)
  const was = new Map((prev ?? []).map((r) => [r.value, r.visitors]))
  const now = (cur ?? []).filter((r) => r.visitors > 0)
  const seen = new Set(now.map((r) => r.value))
  const gone = base ? (prev ?? []).filter((r) => !seen.has(r.value) && r.visitors >= FLOOR).map((r) => ({ value: r.value, visitors: 0 })) : []
  return [...now, ...gone]
    .map((r) => {
      const s = statOf(r.visitors, was.get(r.value), base)
      return { val: r.value, name: name(r.value), v: s.v, c: s.c, st: s.st, ...extra?.(r.value) }
    })
    .sort((a, b) => b.v - a.v)
}

/** "+29% vs usual", "as usual" or nothing to compare: what the little note on a card says. */
export function noteOf(s: Stat, vs: string, usual: string, none: string): { c: string; t: string } {
  if (s.c > 0.5 && s.st) {
    const p = Math.round((s.v / s.c - 1) * 100)
    return { c: s.st, t: `${p >= 0 ? '+' : '−'}${Math.abs(p)}% ${vs}` }
  }
  return { c: '', t: s.c > 0.5 ? usual : none }
}
