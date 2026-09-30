// A number against the same number in the period before, as the small ▲ / ▼
// the new cards carry on every row. Pure: change.test.ts.

export type Move = { dir: 'up' | 'down' | 'flat'; pct: number }

/** How far `now` moved from `before`, in whole percent; null when there is nothing to compare with. */
export function moveOf(now: number, before: number | undefined): Move | null {
  if (before === undefined || !(before > 0)) return null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { dir: 'flat', pct: 0 }
  return { dir: pct > 0 ? 'up' : 'down', pct: Math.abs(pct) }
}

/** A row's share of the whole, from none to all. */
export function shareOf(value: number, whole: number): number {
  return whole > 0 ? Math.max(0, Math.min(1, value / whole)) : 0
}
