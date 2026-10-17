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
 * replacing what was read meanwhile), kept in step with other tabs, and every mark told to the server once.
 */
export function useReadSet(on: boolean, delay = 3000) {
  const [read, setRead] = useState<Set<string>>(loadLocal)
  const latest = useRef(read)
  const join = useCallback((ids: Iterable<string>) => {
    const u = new Set([...ids, ...latest.current])
    if (u.size === latest.current.size) return
    latest.current = u
    saveLocal(u)
    setRead(u)
  }, [])
  useEffect(() => {
    if (!on) return
    let live = true
    // After the first paint has had its reads: the bell is not what the page is waiting for.
    const first = setTimeout(() => void syncRead(loadLocal()).then((all) => live && all && join(all)), delay)
    const other = (e: StorageEvent) => e.key === KEY && join(loadLocal())
    window.addEventListener('storage', other)
    return () => {
      live = false
      clearTimeout(first)
      window.removeEventListener('storage', other)
    }
  }, [on, join, delay])
  const mark = useCallback(
    (ids: string[]) => {
      const fresh = ids.filter((id) => !latest.current.has(id))
      if (!fresh.length) return
      join(fresh)
      void more.markBellRead(fresh.slice(-PER_POST)).catch(() => undefined)
    },
    [join],
  )
  return { read, mark }
}
