// Going offline is told once, in the toast every other notice uses: the page keeps
// showing what it last had, and says so. The first run has nothing cached to show,
// so it holds the notice back (quietOffline).
import { toast } from '../components/toastBus'
import { toastCopy } from '../components/toastCopy'

let quiet = false

/** The first run is up: there is no last data to show, so going offline is not told. */
export function quietOffline(on: boolean) {
  quiet = on
}

const tell = () => {
  if (!quiet) toast(toastCopy.offline, 'warning')
}

addEventListener('offline', tell)
// At start the first run is not drawn yet: look again once it has had its moment.
if (!navigator.onLine) setTimeout(() => !navigator.onLine && tell(), 2000)
