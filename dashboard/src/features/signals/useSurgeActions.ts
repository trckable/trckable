// What the surge card and its story can do: open today in Data filtered to the
// source, and ask for browser notices (from a click only, never by itself).
import { toast } from '../../components/Toast'
import { setView } from '../../lib/url'
import { signals } from './copy'
import { askPermission, canNotify } from './notify'
import { pref, setPref } from './prefs'
import { surgeFilter, type Surge } from './surge'

export function useSurgeActions(surge: Surge, done: () => void) {
  const filter = surgeFilter(surge)
  const see = () => {
    setView({ live: false, period: 'today', from: undefined, to: undefined, filters: filter ? [filter] : [], day: undefined })
    done()
  }
  /** Offered to someone who has not decided, in a browser that can. */
  const canAsk = canNotify() && Notification.permission === 'default' && !pref('notify')
  const notify = () => {
    void askPermission().then((p) => {
      setPref('notify', p === 'granted')
      if (p === 'denied') toast(signals.blocked, 'warning')
    })
  }
  return { see, canAsk, notify }
}
