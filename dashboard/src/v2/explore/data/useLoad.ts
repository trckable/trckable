// One read for one key: loading until it answers, the answer, or what went wrong. A new key starts a new read and
// drops the old one's answer, so a page never shows numbers for something other than what it asks about.
import { useCallback, useEffect, useState } from 'react'
import { messageOf } from '../../../lib/api'

/** `stale`: the last answer, held dimmed while the read for a new filter or period is on its way. */
export type Loaded<T> = { state: 'loading' } | { state: 'error'; message: string; retry: () => void } | { state: 'ok'; data: T; stale?: boolean }

const LOADING = { state: 'loading' } as const

export function useLoad<T>(key: string, run: (signal: AbortSignal) => Promise<T>, on: boolean): Loaded<T> {
  const [got, setGot] = useState<{ key: string; r: Loaded<T> } | null>(null)
  const [round, setRound] = useState(0)
  const retry = useCallback(() => setRound((n) => n + 1), [])
  const at = `${key}|${round}`
  useEffect(() => {
    window.addEventListener('trckable:refresh', retry)
    return () => window.removeEventListener('trckable:refresh', retry)
  }, [retry])
  useEffect(() => {
    if (!on) return
    const ctl = new AbortController()
    run(ctl.signal).then(
      (data) => !ctl.signal.aborted && setGot({ key: at, r: { state: 'ok', data } }),
      (e: unknown) => !ctl.signal.aborted && setGot({ key: at, r: { state: 'error', message: messageOf(e), retry } }),
    )
    return () => ctl.abort()
    // The key names everything the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, on])
  // A fresh read of the same question keeps what it had until the answer comes.
  if (!got) return LOADING
  if (got.key === at || (got.r.state === 'ok' && got.key.startsWith(`${key}|`))) return got.r
  return got.r.state === 'ok' && on ? { ...got.r, stale: true } : LOADING
}
