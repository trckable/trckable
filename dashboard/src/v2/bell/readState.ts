// Which notices a person has read: kept on the server per account, with this browser's copy as the fallback.
import { useCallback, useEffect, useRef, useState } from 'react'
import { more } from '../../lib/apiMore'

export const KEY = 'trckable:bell:read'
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

/**
 * The read set a bell shows: this browser's copy at first, joined with the account's once the server answers (never
 * replacing what was read meanwhile), kept in step with other tabs, and every mark told to the server at once (the row is read
 * before the server has answered); a mark the server did not take is told again at the next read of the list.
 */
// Whether the account's list has been asked for once in this page (a bell that mounts again does not wait for it again).
let askedOnce = false

export function useReadSet(on: boolean, delay = 3000) {
  const [read, setRead] = useState<Set<string>>(loadLocal)
  const [synced, setSynced] = useState(askedOnce)
  const latest = useRef(read)
  /** Adds ids to the read set. `newest` ids go last (a mark just made), so the oldest are what `KEEP` drops; the rest come first. */
  const join = useCallback((ids: Iterable<string>, newest = false) => {
    const u = new Set(newest ? [...latest.current, ...ids] : [...ids, ...latest.current])
    if (u.size === latest.current.size) return
    latest.current = u
    saveLocal(u)
    setRead(u)
  }, [])
  const started = useRef(false)
  const failed = useRef(new Set<string>())
  const tell = useCallback((ids: string[]) => {
    void more.markBellRead(ids.slice(-PER_POST)).catch(() => ids.forEach((id) => failed.current.add(id)))
  }, [])
  /** Asks for the account's list, once: at the delay below, or sooner when the bell is about to be opened. `synced` says it has answered (or could not). Later it tells again what the server did not take. */
  const sync = useCallback(() => {
    if (started.current) {
      if (failed.current.size) {
        const ids = [...failed.current]
        failed.current.clear()
        tell(ids)
      }
      return
    }
    started.current = true
    void syncRead(loadLocal()).then((all) => {
      if (all) join(all)
      askedOnce = true
      setSynced(true)
    })
  }, [join, tell])
  useEffect(() => {
    if (!on) return
    // After the first paint has had its reads: the bell is not what the page is waiting for.
    const first = setTimeout(sync, delay)
    const other = (e: StorageEvent) => e.key === KEY && join(loadLocal())
    window.addEventListener('storage', other)
    return () => {
      clearTimeout(first)
      window.removeEventListener('storage', other)
    }
  }, [on, join, delay, sync])
  const mark = useCallback(
    (ids: string[]) => {
      const fresh = ids.filter((id) => !latest.current.has(id))
      if (!fresh.length) return
      join(fresh, true)
      tell(fresh)
    },
    [join, tell],
  )
  return { read, mark, synced, sync }
}
