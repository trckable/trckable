// What the ring remembers: "Hide this" per account (told to the server, this browser's copy as the fallback), and in
// this browser when everything counted was first seen done, which starts the seven days of the check.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { more } from '../../lib/apiMore'
import { hideId, hiddenBy } from './model'

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
