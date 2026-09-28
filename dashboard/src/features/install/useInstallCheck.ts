// "I've installed it": the server reads the site's homepage (the same guarded,
// rate-limited check Settings → Install uses) and says what it found. While
// the script is not found yet, it looks again every 30 seconds; once it is,
// only the live stream matters, and nothing more is fetched.
import { useCallback, useEffect, useState } from 'react'
import { api, APIError, type InstallCheck } from '../../lib/api'

export const RECHECK_MS = 30_000
/** After a 429 the server's window is ten minutes: wait out a good part of it. */
export const BACKOFF_MS = 5 * 60_000

export type CheckState =
  | { phase: 'idle' }
  | { phase: 'checking'; last?: InstallCheck }
  | { phase: 'done'; result: InstallCheck }
  | { phase: 'limited'; last?: InstallCheck }
  | { phase: 'failed'; last?: InstallCheck }

const lastOf = (s: CheckState) => {
  if (s.phase === 'done') return s.result
  if (s.phase === 'idle') return undefined
  return s.last
}

/** How long until the next look, or null for none: found, or a visit came. */
export function nextLook(s: CheckState, live: boolean): number | null {
  if (live) return null
  switch (s.phase) {
    case 'done':
      return s.result.found === 'site' ? null : RECHECK_MS
    case 'limited':
      return BACKOFF_MS
    case 'failed':
      return RECHECK_MS
    default:
      return null
  }
}

export function useInstallCheck(site: string, live: boolean) {
  const [state, setState] = useState<CheckState>({ phase: 'idle' })
  // Each round is one check; bumping it asks for another.
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (round === 0) return
    let current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the check starts now: say so while it runs
    setState((s) => ({ phase: 'checking', last: lastOf(s) }))
    api
      .checkInstall(site)
      .then((result) => current && setState({ phase: 'done', result }))
      .catch((e: unknown) => {
        if (!current) return
        const limited = e instanceof APIError && e.status === 429
        setState((s) => ({ phase: limited ? 'limited' : 'failed', last: lastOf(s) }))
      })
    return () => {
      current = false
    }
  }, [site, round])

  const wait = nextLook(state, live)
  useEffect(() => {
    if (wait === null) return
    const t = setTimeout(() => setRound((n) => n + 1), wait)
    return () => clearTimeout(t)
  }, [wait, state])

  const start = useCallback(() => setRound((n) => n + 1), [])
  return { state, start }
}
