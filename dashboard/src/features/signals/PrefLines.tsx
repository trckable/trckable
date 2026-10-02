// The live extras' choices, as lines of the account window's Preferences:
// the count in the tab, the sale chime and the browser notices, each an Off | On
// pair (these are about this browser, not about the account's data, so a viewer
// has them too). Kept in this browser (prefs.ts). Turning a notice on is a
// click, so it is where the browser's own question is asked; turning the chime
// on plays it once, which is also what lets the browser play it later.
import { Bell, Coins, Radio } from 'lucide-react'
import { toast } from '../../components/Toast'
import { Line } from '../../views/AccountLine'
import { chime } from './chime'
import { signals } from './copy'
import { askPermission, canNotify } from './notify'
import { usePref } from './prefs'

/** Off | On, the way the theme is chosen. */
function OnOff({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      <button type="button" aria-pressed={!on} onClick={() => onChange(false)}>
        {signals.off}
      </button>
      <button type="button" aria-pressed={on} onClick={() => onChange(true)}>
        {signals.on}
      </button>
    </div>
  )
}

export function TabCountLine() {
  const [on, set] = usePref('tab')
  return (
    <Line icon={Radio} label={signals.tab.label} hint={signals.tab.hint}>
      <OnOff on={on} label={signals.tab.label} onChange={set} />
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
        <OnOff
          on={sound}
          label={signals.sound.label}
          onChange={(next) => {
            setSound(next)
            if (next) chime()
          }}
        />
      </Line>
      {canNotify() && (
        <Line icon={Bell} label={signals.notify.label} hint={signals.notify.hint}>
          <OnOff on={notify} label={signals.notify.label} onChange={(next) => (next ? turnOnNotices() : setNotify(false))} />
        </Line>
      )}
    </>
  )
}
