// The order a person arranges a flat list in (teams, accounts): ids in, ids out, pure so the list, its keys and the tests read
// one thing.

/** `id` moved before `before` (none: last). */
export function moveBefore(ids: string[], id: string, before?: string): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = before === undefined ? rest.length : rest.indexOf(before)
  return at < 0 ? ids : [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** `id` one place up (-1) or down (1). */
export function stepOrder(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const out = [...ids]
  out[i] = ids[j]
  out[j] = id
  return out
}

/** Where the pointer (y) says `id` goes among the rows `[data-<key>]` of `box`: before which row (none: last), or null over no row. */
export function pointedBefore(box: HTMLElement, key: string, id: string, y: number): { before?: string } | null {
  for (const li of box.querySelectorAll<HTMLElement>(`[data-${key}]`)) {
    const r = li.getBoundingClientRect()
    if (li.dataset[key] === id || y < r.top || y >= r.bottom) continue
    if (y <= r.top + r.height / 2) return { before: li.dataset[key] }
    let next = li.nextElementSibling as HTMLElement | null
    if (next?.dataset[key] === id) next = next.nextElementSibling as HTMLElement | null
    return { before: next?.dataset[key] }
  }
  return null
}
