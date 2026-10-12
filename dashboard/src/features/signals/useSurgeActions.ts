// What the surge card and its story can do: open Data on the moment, and ask for browser notices (from a click only, never by itself).
import { toast } from '../../components/Toast'
import { setView } from '../../lib/url'
import { signals } from './copy'
import { askPermission, canNotify } from './notify'
import { pref, setPref } from './prefs'
import { seeInData, seePageInData, type Surge } from './surge'

export function useSurgeActions(surge: Surge, tz: string, done: () => void) {
  const see = () => {
    setView(seeInData(surge, tz))
    done()
  }
  const seePage = (page: string) => {
    setView(seePageInData(surge, tz, page))
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
  return { see, seePage, canAsk, notify }
}
