// One read for one key: loading until it answers, the answer, or what went wrong. A new key (site, period, compare,
// filter) starts a new read and drops the old one's answer at once: a page never shows numbers for something other than
// what it asks about. The same key read again (a refresh) keeps its answer on screen until the new one lands.
import { useCallback, useEffect, useState } from 'react'
import { messageOf } from '../../../lib/api'

export type Loaded<T> = { state: 'loading' } | { state: 'error'; message: string; retry: () => void } | { state: 'ok'; data: T }

const LOADING = { state: 'loading' } as const

export function useLoad<T>(key: string, run: (signal: AbortSignal, soon: (data: T) => void) => Promise<T>, on: boolean): Loaded<T> {
  const [got, setGot] = useState<{ key: string; at: string; r: Loaded<T> } | null>(null)
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
    run(ctl.signal, (data) => !ctl.signal.aborted && setGot({ key, at, r: { state: 'ok', data } })).then(
      (data) => !ctl.signal.aborted && setGot({ key, at, r: { state: 'ok', data } }),
      (e: unknown) => !ctl.signal.aborted && setGot({ key, at, r: { state: 'error', message: messageOf(e), retry } }),
    )
    return () => ctl.abort()
    // The key names everything the read depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, on])
  // A fresh read of the same question keeps what it had until the answer comes; another question shows nothing of it.
  if (!got || got.key !== key) return LOADING
  if (got.at === at || got.r.state === 'ok') return got.r
  return LOADING
}
