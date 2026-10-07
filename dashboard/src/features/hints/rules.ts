// Which hint is next, if any. The order is the unlock order: a hint waits for
// the one before it to be seen. One at a time, one a visit, none in the first
// seconds, none once turned off; a viewer or shared link only sees the first
// two. Pure over what the caller knows: rules.test.ts.

export type HintId = 'story' | 'rows' | 'peek'
export const ORDER: HintId[] = ['story', 'rows', 'peek']

/** Hints a viewer (a read-only person or a shared link) may see. */
export const FOR_VIEWERS: HintId[] = ['story', 'rows']

/** The quiet at the start of a visit, in milliseconds. */
export const QUIET_MS = 10_000

export interface Known {
  seen: HintId[]
  off: boolean
  /** A hint was already shown on this visit. */
  shown: boolean
  /** Milliseconds since the page opened. */
  age: number
  viewer: boolean
  /** The place each hint points at is on the page now. */
  here: Record<HintId, boolean>
  /** Something is open over the page (a dialog or a menu). */
  covered: boolean
}

export function nextHint(k: Known): HintId | null {
  if (k.off || k.shown || k.covered || k.age < QUIET_MS) return null
  const next = ORDER.find((id) => !k.seen.includes(id))
  if (!next) return null
  if (k.viewer && !FOR_VIEWERS.includes(next)) return null
  return k.here[next] ? next : null
}

export const allDone = (seen: HintId[], viewer: boolean): boolean => (viewer ? FOR_VIEWERS : ORDER).every((id) => seen.includes(id))
