import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sale, Visit } from '../../lib/api'
import { debounce } from '../../lib/live'
import { liveNow, type LiveNow } from './api'
import { MINUTE } from './model'

// The stream says something arrived: read /now again once visits settle for
// a moment, and at least every few seconds while they keep coming.
const SETTLE_MS = 700
const MAX_WAIT_MS = 4000
// A failed read is tried again after this long.
const RETRY_MS = 5000
// While the stream is stuck, /now is polled like the report is.
const POLL_MS = 15_000
// How often "2 min ago" and the idle cut-off are worked out again.
const TICK_MS = 5000

type Stream = { visits: (Visit & { id: number })[]; sales: (Sale & { id: number })[]; stale: boolean }

/**
 * Live mode's data: the server's last 30 minutes, read again whenever the
 * stream brings something, at each new minute and when the tab is shown
 * again. `clock` is the server's time now (its answer's time, moved on by
 * the local clock), so a browser with a wrong clock still counts right.
 */
export function useLiveNow(site: string, stream: Stream) {
  // The answer, and the local time it arrived.
  const [answer, setAnswer] = useState<{ data: LiveNow; got: number } | null>(null)
  // Failed reads in a row: each one schedules the next try.
  const [failures, setFailures] = useState(0)
  const [local, setLocal] = useState(() => Date.now())
  const ctl = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    liveNow(site, c.signal)
      .then((d) => {
        if (c.signal.aborted) return
        const now = Date.now()
        setLocal(now)
        // An answer older than the one shown (a slow read landing late) is dropped.
        setAnswer((was) => (was && d.at < was.data.at ? was : { data: d, got: now }))
        setFailures(0)
      })
      .catch(() => {
        if (!c.signal.aborted) setFailures((n) => n + 1)
      })
  }, [site])

  // A new site starts clean.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new site: drop the old site's numbers while its own load
    setAnswer(null)
    load()
    const wake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', wake)
    return () => {
      document.removeEventListener('visibilitychange', wake)
      ctl.current?.abort()
    }
  }, [load])

  // A failed read is tried again in a moment.
  useEffect(() => {
    if (!failures) return
    const t = setTimeout(load, RETRY_MS)
    return () => clearTimeout(t)
  }, [failures, load])

  // Something new on the stream.
  const settle = useRef<ReturnType<typeof debounce> | null>(null)
  useEffect(() => {
    const d = debounce(load, SETTLE_MS, MAX_WAIT_MS)
    settle.current = d
    return d.cancel
  }, [load])
  const newest = `${stream.visits[0]?.id ?? 0}:${stream.sales[0]?.id ?? 0}`
  const first = useRef(newest)
  useEffect(() => {
    if (newest === first.current) return
    settle.current?.call()
  }, [newest])

  // The minute turns on the server's clock: the chart moves on, read again.
  const at = answer?.data.at
  useEffect(() => {
    if (at === undefined) return
    const next = MINUTE - (at % MINUTE) + 250
    const t = setTimeout(load, next)
    return () => clearTimeout(t)
  }, [at, load])

  // While the stream is stuck, poll.
  useEffect(() => {
    if (!stream.stale) return
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => clearInterval(t)
  }, [stream.stale, load])

  useEffect(() => {
    const t = setInterval(() => setLocal(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  const clock = answer ? answer.data.at + Math.max(0, local - answer.got) : 0
  // How far the server's clock is from this browser's: lets a panel tick
  // faster than TICK_MS on its own (the live list's "5s" chips).
  const skew = answer ? answer.data.at - answer.got : 0
  return { data: answer?.data ?? null, got: answer?.got ?? 0, failed: failures > 0, clock, skew }
}
