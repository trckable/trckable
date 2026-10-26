// Going offline is told once, in the toast every other notice uses: the page keeps
// showing what it last had, and says so. The browser's word is not enough (a VPN or
// Wi-Fi handover flips it while the page still works): after a few seconds the page
// asks its own server, and speaks only if that fails too. It stays until a request
// gets through (or the browser says it is online), and then goes at once.
// The first run has nothing cached to show, so it holds the notice back (quietOffline).
import { settle, toast } from '../components/toastBus'
import { toastCopy } from '../components/toastCopy'
import { API_BASE } from './apiBase'
import { dateFmt } from './format'

export const OFFLINE_GRACE_MS = 5000
/** The server is asked this long, and again this often while the notice is up. */
export const PING_MS = 2000
export const RETRY_MS = 5000

let quiet = false
let timer: ReturnType<typeof setTimeout> | undefined
let shown: number | undefined
let since = ''
let down = false
let retry: ReturnType<typeof setInterval> | undefined

/** The first run is up: there is no last data to show, so going offline is not told. */
export function quietOffline(on: boolean) {
  quiet = on
}

/** The time as the language writes it, with no leading zero and never broken across two lines. */
const clock = (d: Date) => dateFmt(undefined, { hour: 'numeric', minute: '2-digit' }).format(d).replace(/\s/g, '\u00a0')

/**
 * Our own API answers (a tiny request, never cached), through the same base every real request uses.
 * Any reply from the API proves we are online, even a refusal (signed out); a page of HTML is not
 * the API (a proxy's fallback page), and only a network error or a timeout counts as offline.
 */
async function alive(): Promise<boolean> {
  const stop = new AbortController()
  const cut = setTimeout(() => stop.abort(), PING_MS)
  try {
    const res = await fetch(API_BASE + '/me', { cache: 'no-store', credentials: 'same-origin', signal: stop.signal })
    return !(res.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  } finally {
    clearTimeout(cut)
  }
}

const tell = async () => {
  timer = undefined
  if (quiet || shown !== undefined) return
  if (await alive()) return
  // The browser came back while the server was being asked.
  if (!down || shown !== undefined) return
  shown = toast(toastCopy.offline(since), 'busy')
  retry = setInterval(() => void alive().then((ok) => ok && back()), RETRY_MS)
}

const lost = () => {
  down = true
  if (timer || shown !== undefined) return
  since = clock(new Date())
  timer = setTimeout(() => void tell(), OFFLINE_GRACE_MS)
}

const back = () => {
  down = false
  clearTimeout(timer)
  clearInterval(retry)
  timer = undefined
  retry = undefined
  if (shown !== undefined) settle(shown, '')
  shown = undefined
}

addEventListener('offline', lost)
addEventListener('online', back)
// At start the first run is not drawn yet: look again once it has had its moment.
if (!navigator.onLine) lost()
