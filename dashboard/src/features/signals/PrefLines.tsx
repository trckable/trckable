// The live extras' switches, as lines of the account window's Preferences:
// the count in the tab, the sale chime and the browser notices. Kept in this
// browser (prefs.ts). Turning a notice on is a click, so it is where the
// browser's own question is asked; turning the chime on plays it once, which
// is also what lets the browser play it later.
import { Bell, Coins, Radio } from 'lucide-react'
import { toast } from '../../components/Toast'
import { Switch } from '../../components/Switch'
import { Line } from '../../views/AccountLine'
import { chime } from './chime'
import { signals } from './copy'
import { askPermission, canNotify } from './notify'
import { usePref } from './prefs'

export function TabCountLine() {
  const [on, set] = usePref('tab')
  return (
    <Line icon={Radio} label={signals.tab.label} hint={signals.tab.hint}>
      <Switch on={on} onChange={() => set(!on)} />
    </Line>
  )
}

export function SaleLines() {
  const [sound, setSound] = usePref('sound')
  const [notify, setNotify] = usePref('notify')
  const turnOnNotices = () => {
    void askPermission().then((p) => {
      setNotify(p === 'granted')
      if (p !== 'granted') toast(signals.blocked, 'warning')
    })
  }
  return (
    <>
      <Line icon={Coins} label={signals.sound.label} hint={signals.sound.hint}>
        <Switch
          on={sound}
          onChange={() => {
            setSound(!sound)
            if (!sound) chime()
          }}
        />
      </Line>
      {canNotify() && (
        <Line icon={Bell} label={signals.notify.label} hint={signals.notify.hint}>
          <Switch on={notify} onChange={() => (notify ? setNotify(false) : turnOnNotices())} />
        </Line>
      )}
    </>
  )
}
