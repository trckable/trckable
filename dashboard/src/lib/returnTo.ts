// Where a person was when sign-in took the screen (a link opened signed out, a
// session that ended mid-use): after signing in they go back there, not to the
// main dashboard. Kept for the tab only, and only for a few minutes.

import { navigate } from './url'

const KEY = 'trckable:return'
const FRESH_MS = 30 * 60_000

/** Remember the address on screen, unless it is one of the sign-in pages. */
export function rememberReturn(now = Date.now()) {
  const here = location.pathname + location.search + location.hash
  if (/^\/(login|setup|s(\/|$))/.test(location.pathname)) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ to: here, at: now }))
  } catch {
    /* storage can be shut: the main dashboard then */
  }
}

/** The remembered address, once; null when there is none, it is old, or it is not an address of this app. */
export function takeReturn(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    const v = raw ? (JSON.parse(raw) as { to?: unknown; at?: unknown }) : null
    if (!v || typeof v.to !== 'string' || typeof v.at !== 'number' || now - v.at > FRESH_MS) return null
    return /^\/(?![/\\])/.test(v.to) && !/^\/(login|setup)(\/|\?|#|$)/.test(v.to) ? v.to : null
  } catch {
    return null
  }
}

/** Called as the screen changes: signed out, it goes to /login keeping the address; signed in again at /login, it goes back. True when it moved the address back. */
export function keepSignInReturn(state: string, path: string, gated: boolean): boolean {
  if (state === 'login' && path !== '/login') {
    rememberReturn()
    navigate('/login', { replace: true })
    return false
  }
  const back = state === 'ready' && !gated && path === '/login' ? takeReturn() : null
  if (back) navigate(back, { replace: true })
  return !!back
}
