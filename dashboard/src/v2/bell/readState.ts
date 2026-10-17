// Which notices a person has read: kept on the server per account, with this browser's copy as the fallback.
import { more } from '../../lib/apiMore'

const KEY = 'trckable:bell:read'
const KEEP = 300
const PER_POST = 100

export const loadLocal = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export const saveLocal = (s: ReadonlySet<string>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s].slice(-KEEP)))
  } catch {
    /* a blocked store only forgets which were read */
  }
}

/** What this browser has read that the server has not been told. */
export const unsent = (local: ReadonlySet<string>, server: readonly string[]): string[] => {
  const known = new Set(server)
  return [...local].filter((id) => !known.has(id)).slice(-PER_POST)
}

/** The server's list joined with the local one (and the local extras sent up); null when the server cannot be reached. */
export async function syncRead(local: ReadonlySet<string>): Promise<Set<string> | null> {
  try {
    const { read } = await more.bellRead()
    const extra = unsent(local, read)
    if (extra.length) await more.markBellRead(extra).catch(() => undefined)
    return new Set([...[...read].reverse(), ...local])
  } catch {
    return null
  }
}
