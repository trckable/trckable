// The top of one breakdown (pages, sources): the report's own current and previous rows, ranked, each with its change.
import type { Row } from '../../lib/api'

export interface Item {
  value: string
  /** The page's title, where the list is of pages and the site's script sent one. */
  title?: string
  now: number
  was: number
  /** Percent change against the period before; null for a value with nothing before it (shown as "new", never as infinity). */
  pct: number | null
  /** Seen now and not at all before: only said when the previous list was whole, so a value cut from it is not mistaken for new. */
  fresh: boolean
}

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
  const titles = new Map([...was, ...now].flatMap((r) => (r.title ? [[r.value, r.title] as const] : [])))
  const out: Item[] = []
  for (const value of new Set([...after.keys(), ...before.keys()])) {
    const n = after.get(value) ?? nowCut
    const w = before.get(value) ?? wasCut
    out.push({ value, ...(titles.has(value) ? { title: titles.get(value) } : {}), now: n, was: w, pct: w > 0 ? ((n - w) / w) * 100 : null, fresh: w === 0 && n > 0 })
  }
  return out
}

/** The most visitors this period, each with its change against the period before; the same count orders by name, so the order never flickers. */
export function topOf(cur: Row[] | null | undefined, prev: Row[] | null | undefined, rows = ROWS): Item[] {
  return itemsOf(cur, prev)
    .filter((i) => i.now > 0)
    .sort((a, b) => b.now - a.now || a.value.localeCompare(b.value))
    .slice(0, rows)
}
