// Is there a newer trckable? The owner's browser asks GitHub's list of
// releases, at most once a day, and remembers the answer here. The request
// carries nothing about this instance: no version, no id, no cookie — GitHub
// sees what any visitor to the releases page shows it. The server never calls
// out. Off for everyone with TRCKABLE_UPDATE_CHECK=off, and off in this
// browser from Account.
import { useEffect, useState } from 'react'

const CACHE = 'tkb_latest'
const OFF = 'tkb_update_off'
const DAY = 24 * 3600 * 1000
const RELEASES = 'https://api.github.com/repos/trckable/trckable/releases/latest'

export type Latest = { v: string; at: number; url?: string; notes?: string }

const read = (key: string): Latest | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Latest) : null
  } catch {
    return null
  }
}

/** Whether this browser looks for new versions (Account → the switch). */
export function checksHere(): boolean {
  try {
    return localStorage.getItem(OFF) !== '1'
  } catch {
    return true
  }
}

export function setChecksHere(on: boolean) {
  try {
    if (on) localStorage.removeItem(OFF)
    else localStorage.setItem(OFF, '1')
  } catch {
    /* storage blocked: nothing is remembered, nothing is checked either */
  }
  window.dispatchEvent(new Event('trckable:update'))
}

/** a newer than b, for x.y.z versions (a leading v is fine). */
export function newer(a: string, b: string): boolean {
  const p = (s: string) => s.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [x, y] = [p(a), p(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

/** The newer release, if there is one this owner should hear about. */
export function useLatest(current: string | undefined, allowed: boolean | undefined): Latest | null {
  const [latest, setLatest] = useState<Latest | null>(() => read(CACHE))
  const [, bump] = useState(0)
  useEffect(() => {
    const on = () => bump((n) => n + 1)
    window.addEventListener('trckable:update', on)
    return () => window.removeEventListener('trckable:update', on)
  }, [])
  useEffect(() => {
    if (!allowed || !current || !checksHere()) return
    const cached = read(CACHE)
    if (cached && Date.now() - cached.at < DAY) return
    // The asking itself is its own small chunk (updateFetch.ts): most
    // days the answer above is fresh and it is never needed.
    const ctl = new AbortController()
    void import('./updateFetch').then((m) => m.fetchLatest(RELEASES, CACHE, ctl.signal)).then((next) => next && setLatest(next))
    return () => ctl.abort()
  }, [allowed, current])
  if (!allowed || !current || !checksHere() || !latest || !newer(latest.v, current)) return null
  return latest
}
