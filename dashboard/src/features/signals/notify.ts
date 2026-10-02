// The browser's notices, for the three things worth one: asked for only from a
// click, shown only for a person who said yes, and while the tab is in sight a
// toast instead (a notice over the page being looked at is noise).
import { toast } from '../../components/Toast'
import { pref } from './prefs'

export const canNotify = () => typeof Notification !== 'undefined'

/** Must be called from a click: browsers refuse (or hide) a question the page asks by itself. */
export function askPermission(): Promise<NotificationPermission> {
  return canNotify() ? Notification.requestPermission() : Promise.resolve('denied')
}

export function tell(title: string, body: string, tag: string) {
  if (!pref('notify')) return
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    toast(`${title}. ${body}`, 'info')
    return
  }
  if (canNotify() && Notification.permission === 'granted') new Notification(title, { body, tag })
}
