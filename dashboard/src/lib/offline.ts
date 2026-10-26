// Going offline is told once, in the toast every other notice uses: the page keeps
// showing what it last had, and says so. A one-second blip (Wi-Fi roaming, wake from
// sleep, VPN) is not told: it speaks only if the browser is still offline after a
// few seconds, stays until the connection is back, and then goes at once.
// The first run has nothing cached to show, so it holds the notice back (quietOffline).
import { settle, toast } from '../components/toastBus'
import { toastCopy } from '../components/toastCopy'
import { dateFmt } from './format'

export const OFFLINE_GRACE_MS = 5000

let quiet = false
let timer: ReturnType<typeof setTimeout> | undefined
let shown: number | undefined
let since = ''

/** The first run is up: there is no last data to show, so going offline is not told. */
export function quietOffline(on: boolean) {
  quiet = on
}

const clock = (d: Date) => dateFmt(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)

const tell = () => {
  timer = undefined
  if (quiet || navigator.onLine || shown !== undefined) return
  shown = toast(toastCopy.offline(since), 'busy')
}

const lost = () => {
  if (timer || shown !== undefined) return
  since = clock(new Date())
  timer = setTimeout(tell, OFFLINE_GRACE_MS)
}

const back = () => {
  clearTimeout(timer)
  timer = undefined
  if (shown !== undefined) settle(shown, '')
  shown = undefined
}

addEventListener('offline', lost)
addEventListener('online', back)
// At start the first run is not drawn yet: look again once it has had its moment.
if (!navigator.onLine) lost()
