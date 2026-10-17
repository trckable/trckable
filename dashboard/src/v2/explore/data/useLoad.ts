// One read for one key: loading until it answers, the answer, or what went wrong. A new key starts a new read and
// drops the old one's answer, so a page never shows numbers for something other than what it asks about.
import { useCallback, useEffect, useState } from 'react'
import { messageOf } from '../../../lib/api'

export type Loaded<T> = { state: 'loading' } | { state: 'error'; message: string; retry: () => void } | { state: 'ok'; data: T }

const LOADING = { state: 'loading' } as const

export function useLoad<T>(key: string, run: (signal: AbortSignal) => Promise<T>, on: boolean): Loaded<T> {
  const [got, setGot] = useState<{ key: string; r: Loaded<T> } | null>(null)
  const [round, setRound] = useState(0)
  const retry = useCallback(() => setRound((n) => n + 1), [])
  const at = `${key}|${round}`
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
  return got && got.key === at ? got.r : LOADING
}
