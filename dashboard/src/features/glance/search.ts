// ⌘K over the report in front of you: pages, sources, countries, devices and
// goals. Typing ranks them; choosing one names the tile whose panel opens and
// the row it is filtered to. Pure: search.test.ts.
import type { TileData } from './model'
import type { TileKey } from './rules'

export type Kind = 'page' | 'source' | 'country' | 'device' | 'goal'

export interface Item {
  kind: Kind
  /** The row's key in its table (what a filter would carry). */
  key: string
  label: string
  visitors: number
}

export interface Pick {
  tile: TileKey
  /** The row the panel opens filtered to. */
  key: string
}

/** Which tile's panel shows each kind. */
export const TILE_OF: Record<Kind, TileKey> = { page: 'carrying', source: 'source', country: 'country', device: 'device', goal: 'goals' }

const KIND_OF: Partial<Record<TileKey, Kind>> = { carrying: 'page', source: 'source', country: 'country', device: 'device', goals: 'goal' }

/** Everything the palette can find, from the tiles' rows. */
export function indexOf(tiles: TileData[]): Item[] {
  const out: Item[] = []
  for (const t of tiles) {
    const kind = KIND_OF[t.key]
    if (!kind) continue
    for (const r of t.rows) out.push({ kind, key: r.key, label: r.label, visitors: r.visitors })
  }
  return out
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** How well a label answers a query: 0 = not at all. */
export function score(label: string, q: string): number {
  const l = norm(label)
  if (!q) return 1
  if (l === q) return 100
  if (l.startsWith(q)) return 80
  if (l.split(/[\s/\-_.:]+/).some((w) => w && w.startsWith(q))) return 60
  if (l.includes(q)) return 40
  return 0
}

export const MAX = 8

/** The best matches first: by how well they match, then by visitors. Without a query, the biggest of each kind. */
export function search(items: Item[], query: string): Item[] {
  const q = norm(query.trim())
  if (!q) {
    const seen: Record<string, number> = {}
    return [...items]
      .sort((a, b) => b.visitors - a.visitors)
      .filter((it) => (seen[it.kind] = (seen[it.kind] ?? 0) + 1) <= 2)
      .slice(0, MAX)
  }
  return items
    .map((it) => ({ it, s: score(it.label, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.it.visitors - a.it.visitors || a.it.label.localeCompare(b.it.label))
    .slice(0, MAX)
    .map((x) => x.it)
}

/** Choosing a result: which panel opens, filtered to which row. */
export const pickOf = (it: Item): Pick => ({ tile: TILE_OF[it.kind], key: it.key })
