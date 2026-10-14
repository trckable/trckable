// What the footer's dot says: is the server there, and is it keeping up. One
// cheap question a minute (who am I), paused while the tab is hidden. Where
// the person may read the server's health (the operator), the same minute
// also looks at how far behind the writer is; anyone else gets a 404 once and
// never asks again.
import { useEffect, useState } from 'react'
import { APIError, call, type Health } from './api'

export type ServerStatus = 'ok' | 'late' | 'down'

const EVERY = 60_000
// Records durable but not yet in the analytics store; a few hundred is a busy second.
const LATE_LAG = 5_000

async function look(health: { off: boolean }): Promise<ServerStatus> {
  try {
    await call('GET', '/me', undefined, undefined, true)
  } catch (e) {
    // A refusal (signed out) still means the server answered.
    if (!(e instanceof APIError) || e.status >= 500) return 'down'
  }
  if (health.off) return 'ok'
  try {
    const h = await call<Health>('GET', '/health', undefined, undefined, true)
    return h.events.lag > LATE_LAG || !!h.ingest_error ? 'late' : 'ok'
  } catch (e) {
    if (e instanceof APIError && e.status < 500) health.off = true
    return 'ok'
  }
}

export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('ok')
  useEffect(() => {
    const health = { off: false }
    let timer = 0
    let gone = false
    const tick = () => {
      window.clearTimeout(timer)
      if (document.hidden) return
      void look(health).then((s) => {
        if (gone) return
        setStatus(s)
        timer = window.setTimeout(tick, EVERY)
      })
    }
    // Back on the tab: look at once, so the dot is never a minute stale.
    document.addEventListener('visibilitychange', tick)
    timer = window.setTimeout(tick, EVERY)
    return () => {
      gone = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return status
}
