// Top, trending up and trending down for one breakdown (pages, sources): the report's own current and previous rows, ranked.
import type { Row } from '../../lib/api'

export type Kind = 'top' | 'up' | 'down'

export interface Item {
  value: string
  now: number
  was: number
  /** Percent change against the period before; null for a value with nothing before it (shown as "new", never as infinity). */
  pct: number | null
  /** Seen now and not at all before: only said when the previous list was whole, so a value cut from it is not mistaken for new. */
  fresh: boolean
}

/** A value counts as trending only when it has at least this many visitors in one of the two periods. Below that, a swing from 1 to 3 is noise. */
export const MIN_COUNT = 5
export const ROWS = 5
const TRUNCATED = 10 // a list this long may have been cut: a value missing from it is not proven to be zero

const smallest = (rows: Row[]) => (rows.length >= TRUNCATED ? Math.min(...rows.map((r) => r.visitors)) : 0)

/** Every value of either period with both counts. A value missing from a cut list is at most that list's smallest row. */
export function itemsOf(cur: Row[] | null | undefined, prev: Row[] | null | undefined): Item[] {
  const now = cur ?? []
  const was = prev ?? []
  const wasCut = smallest(was)
  const nowCut = smallest(now)
  const before = new Map(was.map((r) => [r.value, r.visitors]))
  const after = new Map(now.map((r) => [r.value, r.visitors]))
  const out: Item[] = []
  for (const value of new Set([...after.keys(), ...before.keys()])) {
    const n = after.get(value) ?? nowCut
    const w = before.get(value) ?? wasCut
    out.push({ value, now: n, was: w, pct: w > 0 ? ((n - w) / w) * 100 : null, fresh: w === 0 && n > 0 })
  }
  return out
}

/** Most to least movement; the same movement orders by the bigger percent, then the bigger list, then the name, so the order never flickers. */
const byMove = (sign: 1 | -1) => (a: Item, b: Item) =>
  sign * (b.now - b.was) - sign * (a.now - a.was) ||
  sign * ((b.pct ?? Infinity) - (a.pct ?? Infinity)) ||
  b.now - a.now ||
  a.value.localeCompare(b.value)

/**
 * Top: the most visitors this period. Trending up and down: the biggest rise and fall in visitors against the period
 * before, among values with at least MIN_COUNT visitors in one of the two periods. A value with nothing before it is new.
 */
export function listOf(kind: Kind, cur: Row[] | null | undefined, prev: Row[] | null | undefined, rows = ROWS): Item[] {
  const all = itemsOf(cur, prev)
  if (kind === 'top') {
    return all
      .filter((i) => i.now > 0)
      .sort((a, b) => b.now - a.now || a.value.localeCompare(b.value))
      .slice(0, rows)
  }
  const sign = kind === 'up' ? 1 : -1
  return all
    .filter((i) => Math.max(i.now, i.was) >= MIN_COUNT && sign * (i.now - i.was) > 0)
    .sort(byMove(sign))
    .slice(0, rows)
}
