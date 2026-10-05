// Who is online over every site: one number for the switcher's header and the
// All sites tile, so they can never differ. Any read of the overview feeds it,
// and while either is on screen it is read again every few seconds.
import { useEffect } from 'react'
import { type SiteRow, more } from './apiMore'
import { miniStore } from './miniStore'

const POLL_MS = 15_000

const store = miniStore<number | null>(null)
let users = 0
let timer: ReturnType<typeof setInterval> | undefined
let ctl: AbortController | undefined

/** Takes the online counts of an overview's rows; a row that could not be read has none. */
export function feedOnline(rows: SiteRow[]) {
  store.set(rows.reduce((n, r) => n + (r.error ? 0 : r.online), 0))
}

function read() {
  if (document.visibilityState !== 'visible') return
  ctl?.abort()
  const c = new AbortController()
  ctl = c
  more
    .overview(1, c.signal)
    .then((r) => !c.signal.aborted && feedOnline(r.sites))
    .catch(() => {}) // the number stays as it was until the next read
}

/** The total online now, null until it is read. Keeps it fresh while used. */
export function useOnlineAll(): number | null {
  useEffect(() => {
    if (users++ === 0) {
      timer = setInterval(read, POLL_MS)
      document.addEventListener('visibilitychange', read)
    }
    return () => {
      if (--users > 0) return
      clearInterval(timer)
      ctl?.abort()
      document.removeEventListener('visibilitychange', read)
    }
  }, [])
  return store.use()
}

/** For tests: forget everything. */
export const resetOnline = () => store.set(null)
