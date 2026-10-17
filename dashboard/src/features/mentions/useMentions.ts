// A site's mentions, read when the card opens and again when the tab is shown
// (the server reads them every 20 minutes). A failed read keeps what was shown.
import { useEffect, useState } from 'react'
import { visibleInterval } from '../../lib/visibleInterval'
import { mentionsApi, type Mentions, type Period } from './api'

export type MentionsState = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; data: Mentions }

export function useMentions(site: string, period: Period, every = 0, enabled = true, tick = 0): MentionsState {
  const [answer, setAnswer] = useState<{ key: string; data: Mentions } | 'failed' | null>(null)
  useEffect(() => {
    if (!enabled) return
    const c = new AbortController()
    const load = () =>
      mentionsApi
        .list(site, period, c.signal)
        .then((data) => !c.signal.aborted && setAnswer({ key: site + period, data }))
        .catch(() => !c.signal.aborted && setAnswer((was) => (was && was !== 'failed' ? was : 'failed')))
    void load()
    const stop = every > 0 ? visibleInterval(() => void load(), every) : undefined
    return () => {
      stop?.()
      c.abort()
    }
  }, [site, period, every, enabled, tick])
  if (answer === 'failed') return { state: 'failed' }
  if (answer && answer.key === site + period) return { state: 'ready', data: answer.data }
  return { state: 'loading' }
}
