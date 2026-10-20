// The channels read for a period. Numbers change once a day, so it is read when the period changes and on request; while an
// account has not been read once (just connected), it asks again every few seconds, a handful of times.
import { useCallback, useEffect, useRef, useState } from 'react'
import { words } from '../../lib/errors'
import { channelsApi, type Channels } from './api'
import { cardsOf, waiting } from './model'

const SOON_MS = 4000
const SOON_TRIES = 8

export function useChannels(days: number): { data: Channels | null; err: string; reload: () => void } {
  const [data, setData] = useState<Channels | null>(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const tries = useRef(0)
  const reload = useCallback(() => {
    tries.current = 0
    setTick((n) => n + 1)
  }, [])
  useEffect(() => {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    channelsApi
      .read(days, ac.signal)
      .then((r) => {
        setErr('')
        setData(r)
        if (waiting(cardsOf(r)) && tries.current++ < SOON_TRIES) timer = setTimeout(() => setTick((n) => n + 1), SOON_MS)
      })
      .catch((e: unknown) => !ac.signal.aborted && setErr(words(e)))
    return () => {
      ac.abort()
      clearTimeout(timer)
    }
  }, [days, tick])
  return { data, err, reload }
}
