// Going offline is told once, in the toast every other notice uses: the page keeps
// showing what it last had, and says so.
import { toast } from '../components/toastBus'
import { toastCopy } from '../components/toastCopy'

addEventListener('offline', () => toast(toastCopy.offline, 'warning'))
if (navigator.onLine === false) toast(toastCopy.offline, 'warning')
