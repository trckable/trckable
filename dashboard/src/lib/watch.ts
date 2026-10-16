// The cards a person pinned with Watch: kept in this browser, with what the number was when they started watching
// (so the Briefing can say what changed since). Read as a record.
import { miniStore } from './miniStore'

const KEY = 'trckable.watch'

/** When it was pinned (unix seconds), the card's number then, and what that number counts. */
export interface Watched {
  at: number
  m: number
  u: string
}

function read(): Record<string, Watched> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (Array.isArray(v)) return Object.fromEntries(v.filter((x): x is string => typeof x === 'string').map((k) => [k, { at: 0, m: 0, u: '' }]))
    if (!v || typeof v !== 'object') return {}
    return Object.fromEntries(Object.entries(v).filter(([, w]) => !!w && typeof (w as Watched).at === 'number'))
  } catch {
    return {}
  }
}

export const watched = miniStore<Record<string, Watched>>(read())

/** Pin a card (or let it go): site and card name make its key. */
export function toggleWatch(key: string, now: Watched) {
  const cur = watched.get()
  const next = key in cur ? Object.fromEntries(Object.entries(cur).filter(([k]) => k !== key)) : { ...cur, [key]: now }
  watched.set(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private window: pinned for this visit only */
  }
}
