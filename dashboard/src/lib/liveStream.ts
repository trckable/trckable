// The live stream itself, loaded after the first paint: the dashboard's
// first load has no room for it, and nothing live is on screen before data.
import type { Sale, Visit } from './api'
import { debounce, watchdog } from './live'

// The server sends a ping every 10 s. Nothing for this long means the stream
// is stuck (a proxy holding it back, a phone waking up): open it again, and
// until it speaks, the dashboard polls instead.
const SILENT_MS = 25_000
// Visits come in bursts (a page, then the next): the report is read again
// once they settle for half a second, and at least every 5 s while they go on.
const SETTLE_MS = 500
const MAX_WAIT_MS = 5000
// While the stream is stuck, the report and its online count are polled.
const POLL_MS = 15_000

export type LiveHandlers = {
  online: (n: number | null) => void
  visit: (v: Visit) => void
  sale: (s: Sale) => void
  // true while the stream delivers; false while it is stuck or reconnecting.
  up: (ok: boolean) => void
  // Read the report again, past its cache: something new arrived, the tab
  // was shown again, or (while the stream is stuck) it is time to poll.
  refetch: () => void
}

/** Opens the site's live stream and keeps it open. Returns a stop func. */
export function connect(site: string, on: LiveHandlers): () => void {
  let es: EventSource | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  const settle = debounce(on.refetch, SETTLE_MS, MAX_WAIT_MS)
  let state: boolean | null = null // not known until the stream speaks or fails
  const up = (ok: boolean) => {
    if (ok === state) return
    state = ok
    on.up(ok)
    clearInterval(poll)
    if (ok) return
    on.refetch() // what the stream may have missed
    poll = setInterval(() => document.visibilityState === 'visible' && on.refetch(), POLL_MS)
  }
  const dog = watchdog(SILENT_MS, () => {
    up(false)
    open()
  })
  const heard = () => {
    dog.kick()
    up(true)
  }
  const open = () => {
    es?.close()
    clearTimeout(retry)
    dog.kick()
    const s = new EventSource(`/api/v1/sites/${encodeURIComponent(site)}/live`)
    es = s
    // Every message counts as life: the ping every 10 s, the count every 15 s.
    s.addEventListener('ping', heard)
    s.onerror = () => {
      up(false)
      // A closed stream (a 502 from a proxy) is not retried by the browser.
      if (s.readyState === EventSource.CLOSED) retry = setTimeout(open, 5000)
    }
    s.addEventListener('online', (e: MessageEvent<string>) => {
      heard()
      on.online((JSON.parse(e.data) as { online: number }).online)
    })
    s.addEventListener('visit', (e: MessageEvent<string>) => {
      heard()
      const v = JSON.parse(e.data) as Visit
      on.visit(v)
      settle.call()
    })
    // Only sent while the site's revenue module is on.
    s.addEventListener('sale', (e: MessageEvent<string>) => {
      heard()
      on.sale(JSON.parse(e.data) as Sale)
      settle.call()
    })
  }
  // A tab shown again or a network back: the stream may have died quietly.
  const wake = () => {
    if (document.visibilityState !== 'visible') return
    on.refetch()
    if (es?.readyState !== EventSource.OPEN) open()
  }
  open()
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', open)
  return () => {
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('online', open)
    dog.stop()
    settle.cancel()
    clearInterval(poll)
    clearTimeout(retry)
    es?.close()
  }
}
