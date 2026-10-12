// The checks a stopped site's card runs when it opens: one read of the
// homepage from outside (the guarded, rate-limited call Settings → Install
// uses), again whenever asked.
import { useCallback, useEffect, useState } from 'react'
import { APIError, type InstallCheck, more } from '../../lib/apiMore'

export type Checks = { phase: 'checking' } | { phase: 'done'; result: InstallCheck } | { phase: 'limited' } | { phase: 'failed' }

export function useChecks(site: string) {
  const [state, setState] = useState<Checks>({ phase: 'checking' })
  const [round, setRound] = useState(0)
  useEffect(() => {
    let current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new round starts: say so while it runs
    setState({ phase: 'checking' })
    more
      .checkInstall(site)
      .then((result) => current && setState({ phase: 'done', result }))
      .catch((e: unknown) => current && setState({ phase: e instanceof APIError && e.status === 429 ? 'limited' : 'failed' }))
    return () => {
      current = false
    }
  }, [site, round])
  return { state, again: useCallback(() => setRound((n) => n + 1), []) }
}
