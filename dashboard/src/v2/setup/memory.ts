// What the ring remembers: "Hide this" per account (told to the server, this browser's copy as the fallback), and in
// this browser when everything counted was first seen done, which starts the seven days of the check.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { more, type SetupState } from '../../lib/apiMore'
import { hideId, hiddenBy, STALE } from './model'

const HIDE_KEY = 'trckable:ring:hide'
const DONE_KEY = 'trckable:ring:done'
const KEEP = 40

const get = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}
const put = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* a blocked store only forgets */
  }
}

const hides = (): string[] => {
  const v = get(HIDE_KEY)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** The account's hides, joined with this browser's: hidden(site, stepsLeft) and hide(site, stepsLeft). */
export function useHidden(on: boolean) {
  const [ids, setIds] = useState<string[]>(hides)
  useEffect(() => {
    if (!on) return
    let live = true
    // After the first paint: the ring is not what the page is waiting for.
    const t = setTimeout(() => {
      more
        .bellRead()
        .then(({ read }) => {
          if (!live) return
          const mine = read.filter((id) => id.startsWith('ring:hide:'))
          setIds((cur) => {
            const all = [...new Set([...cur, ...mine])].slice(-KEEP)
            put(HIDE_KEY, all)
            return all
          })
        })
        .catch(() => undefined)
    }, 1500)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [on])
  const hidden = useCallback((site: string, stepsLeft: number) => hiddenBy(ids, site, stepsLeft), [ids])
  const hide = useCallback((site: string, stepsLeft: number) => {
    const id = hideId(site, stepsLeft, Math.floor(Date.now() / 1000))
    setIds((cur) => {
      const all = [...cur, id].slice(-KEEP)
      put(HIDE_KEY, all)
      return all
    })
    void more.markBellRead([id]).catch(() => undefined)
  }, [])
  return { hidden, hide }
}

const doneMap = (): Record<string, number> => {
  const v = get(DONE_KEY)
  return v && typeof v === 'object' ? (v as Record<string, number>) : {}
}

/** When this browser first saw the site all set (null until then, which reads as just now); forgotten as soon as a step is undone. */
export function useDoneSince(site: string | null, allSet: boolean | null): number | null {
  const since = useMemo(() => (site && allSet ? (doneMap()[site] ?? null) : null), [site, allSet])
  useEffect(() => {
    if (!site || allSet === null) return
    const all = doneMap()
    if (!allSet) {
      if (site in all) put(DONE_KEY, Object.fromEntries(Object.entries(all).filter(([k]) => k !== site)))
    } else if (typeof all[site] !== 'number') {
      put(DONE_KEY, { ...all, [site]: Date.now() })
    }
  }, [site, allSet])
  return since
}

const STATE_KEY = 'trckable:ring:state:'
// The parsed checklist per site beside the text it came from, so a read gives the same object until the store changes.
const held = new Map<string, { raw: string | null; state: SetupState | null }>()
const listeners = new Set<() => void>()

const raw = (site: string): string | null => {
  try {
    return localStorage.getItem(STATE_KEY + site)
  } catch {
    return null
  }
}

/** The site's checklist as this browser last read it, so the ring shows at once (null when it was never read). */
export function lastState(site: string): SetupState | null {
  const r = raw(site)
  const had = held.get(site)
  // A blocked store keeps what was told in this page.
  if (had && (had.raw === r || r === null)) return had.state
  const v = get(STATE_KEY + site) as SetupState | null
  const state = v && typeof v.done === 'number' && typeof v.counted === 'number' && Array.isArray(v.items) ? v : null
  held.set(site, { raw: r, state })
  return state
}

/** Keeps the checklist and tells everything that shows a setup prompt, so a skip or a re-enable shows at once. */
export function remember(site: string, state: SetupState) {
  put(STATE_KEY + site, state)
  held.set(site, { raw: raw(site), state })
  listeners.forEach((f) => f())
}

export function onState(f: () => void): () => void {
  listeners.add(f)
  return () => void listeners.delete(f)
}

// The one read of a site's checklist, for the ring and for every prompt that asks whether it is wanted (each keeps the answer with `remember`, as it did when it read for itself): a read already on its way is
// the answer to whoever asks next, and so is one that came back less than `maxAge` ms ago (0: only a read still on its way).
/** How long a read stays the answer to a second asker that does not need it fresh (the ring's first read, after a prompt's). */
export const SHARED_MS = STALE
const reads = new Map<string, { p: Promise<SetupState>; at: number | null }>()

export function readSetup(site: string, maxAge = 0): Promise<SetupState> {
  const r = reads.get(site)
  if (r && (r.at === null || Date.now() - r.at < maxAge)) return r.p
  const entry: { p: Promise<SetupState>; at: number | null } = {
    p: more.setup(site).then(
      (state) => {
        entry.at = Date.now()
        return state
      },
      (e: unknown) => {
        if (reads.get(site) === entry) reads.delete(site)
        throw e
      },
    ),
    at: null,
  }
  reads.set(site, entry)
  return entry.p
}
