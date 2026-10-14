// A row's share of the whole, for the bars the new cards carry. Pure: change.test.ts.

/** A row's share of the whole, from none to all. */
export function shareOf(value: number, whole: number): number {
  return whole > 0 ? Math.max(0, Math.min(1, value / whole)) : 0
}
