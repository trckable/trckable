// What this browser remembers for the cards that speak once a day: per site
// the last visit and what was put away, and per person which features were
// already used. localStorage only, every read and write guarded: a browser
// that will not store them just shows the card again, and never throws.
// (There is no per-person setting on the server for it.)

/** What was kept under `key`, or `none` when nothing was or the browser will not say. */
export function read<T>(key: string, none: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : none
  } catch {
    return none
  }
}

export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode: for this page only */
  }
}

const usedKey = (what: string) => `trckable:used:${what}`

export type Used = 'replay' | 'full'

/** Whether this person has used it: Replay played, Full opened. */
export const wasUsed = (what: Used): boolean => read<boolean>(usedKey(what), false)

export const markUsed = (what: Used) => {
  if (!wasUsed(what)) write(usedKey(what), true)
}
