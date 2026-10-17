// The arrival moment: which rows of "On the site right now" came in since the last look, and how each one shows it.
// Pure: arrivals.test.ts. Nothing counts as new on the first look; ten or more at once enter as one group.

/** This many new rows at once enter together, not one animation each. */
export const BATCH = 10
/** How long a new row keeps its mark: the glow fades within it. */
export const ARRIVE_MS = 2200

/** The keys that were not in the list before, and whether there are enough of them to enter as one group. `before` is null on the first look. */
export function arrivalsOf(before: ReadonlySet<string> | null, keys: readonly string[]): { fresh: string[]; batch: boolean } {
  if (!before) return { fresh: [], batch: false }
  const fresh = keys.filter((k) => !before.has(k))
  return { fresh, batch: fresh.length >= BATCH }
}

/** The classes of a row that just arrived: a group fades in together, reduced motion gets the glow only, else it slides in. */
export function arriveClass(batch: boolean, reduced: boolean): string {
  if (reduced) return 'arriving calm'
  return batch ? 'arriving batch' : 'arriving'
}
