// What a card's one button does. Copying puts the text on the clipboard; "set an alert" opens the site's alerts to set
// it; adding a goal opens the goal dialog; the incident opens the incident record.
import type { Site } from '../../lib/api'
import { openSettings } from '../../lib/settings'
import { say } from '../ui/toast'
import type { Story } from './cards'
import { copy } from './copy'
import { goDeeper } from './deeper'

const short = (t: string) => (t.length > 90 ? `${t.slice(0, 88)}...` : t)

/** Runs the card's action; true when it is done for good (a copy, a goal), so the button says so. */
export function runAct(s: Story, o: { site: Site; onGoal: () => void }): boolean {
  const a = s.act
  if (!a) return false
  if (a.k === 'x') {
    goDeeper(o.site, s.deeper)
    return false
  }
  if (a.k === 'link') {
    window.open(a.url, '_blank', 'noopener,noreferrer')
    return false
  }
  if (a.k === 'copy') {
    try {
      void navigator.clipboard?.writeText(a.text)
    } catch {
      /* the clipboard is not allowed here: the text is on screen in the toast */
    }
    say(a.done, short(a.text))
    return true
  }
  if (a.k === 'set') {
    say(copy.alertOpening, a.msg)
    openSettings(o.site, 'alerts')
    return false
  }
  say(copy.goalOpening, a.msg)
  o.onGoal()
  return false
}
