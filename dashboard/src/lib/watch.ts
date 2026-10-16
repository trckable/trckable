// The cards a person pinned with Watch: kept in this browser, and read as a set.
import { miniStore } from './miniStore'

const KEY = 'trckable.watch'

function read(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const watched = miniStore<string[]>(read())

/** Pin a card (or let it go): site and card name make its key. */
export function toggleWatch(key: string) {
  const now = watched.get()
  const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key]
  watched.set(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private window: pinned for this visit only */
  }
}
