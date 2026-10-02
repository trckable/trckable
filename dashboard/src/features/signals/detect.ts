// What is worth a notice, as plain functions: the live page feeds them what it
// has seen, they say whether it is news. Nothing here knows about the browser.

/** Sources in `now` that were not in `before`. With no earlier list there is nothing to compare with: none. */
export function gained(before: readonly string[] | null, now: readonly string[]): string[] {
  if (!before) return []
  const had = new Set(before)
  return now.filter((s) => !had.has(s))
}

/** How many people are online beside what this tab has seen. A spike is three times that, and at least this many. */
export const SPIKE_TIMES = 3
export const SPIKE_FLOOR = 5
/** Samples of the online count before "usual" means anything. */
const WARM = 6
const KEEP = 60

export class Usual {
  private seen: number[] = []

  /** Takes the next online count; true when it is a spike against the ones before it. */
  add(n: number): boolean {
    const before = this.seen
    const mean = before.length ? before.reduce((a, b) => a + b, 0) / before.length : 0
    const spike = before.length >= WARM && n >= SPIKE_FLOOR && n >= SPIKE_TIMES * Math.max(mean, 1)
    // A spike is not usual: it is kept out, so a long one does not teach the page it is normal.
    if (!spike) this.seen = [...before, n].slice(-KEEP)
    return spike
  }
}

/** Hours without a visit before tracking counts as stopped, as the alert of the same name says by default. */
export const STOPPED_HOURS = 6

/** Whole hours of silence once it passes the line, else 0. `last` and `now` are in ms. */
export function silentHours(last: number | undefined, now: number): number {
  if (!last) return 0
  const h = (now - last) / 3_600_000
  return h >= STOPPED_HOURS ? Math.floor(h) : 0
}
