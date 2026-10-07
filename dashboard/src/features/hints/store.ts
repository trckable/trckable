// What this browser remembers about the hints: which were seen, whether they
// are turned off, and whether this visit has had one. localStorage and
// sessionStorage, every access guarded: a browser that will not store them
// shows a hint again, never throws. (There is no per-person setting on the
// server for it.)
import { read, write } from '../moments/store'
import type { HintId } from './rules'

const KEY = 'trckable:hints'
const VISIT = 'trckable:hint-visit'

export interface Kept {
  seen: HintId[]
  off: boolean
}

export const kept = (): Kept => {
  const k = read<Partial<Kept>>(KEY, {})
  return { seen: Array.isArray(k.seen) ? k.seen : [], off: k.off === true }
}

export const keep = (k: Kept) => write(KEY, k)

/** Whether a hint was already shown since this tab opened. */
export function shownThisVisit(): boolean {
  try {
    return sessionStorage.getItem(VISIT) === '1'
  } catch {
    return false
  }
}

export function markShown() {
  try {
    sessionStorage.setItem(VISIT, '1')
  } catch {
    /* for this page only */
  }
}
