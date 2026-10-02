// The question about browser notices, as a side card: it shows after the first
// sale this tab sees, once ever, and the browser's own question is only asked
// from the button on it.
import { SideCard } from '../../components/SideCard/SideCard'
import { toast } from '../../components/Toast'
import { useSeen } from '../install/seen'
import { signals } from './copy'
import { askPermission, canNotify } from './notify'
import { setPref } from './prefs'
import './signals.css'

const t = signals.card

export function NotifyAsk({ sold }: { sold: boolean }) {
  const [seen, putAway] = useSeen('notify', '*')
  if (!sold || seen || !canNotify() || Notification.permission !== 'default') return null
  const yes = () => {
    putAway()
    void askPermission().then((p) => {
      setPref('notify', p === 'granted')
      if (p === 'denied') toast(signals.blocked, 'warning')
    })
  }
  return (
    <SideCard
      id="notify"
      label={t.label}
      closeLabel={t.close}
      title={t.title}
      onClose={putAway}
      actions={
        <button type="button" className="btn primary" onClick={yes}>
          {t.yes}
        </button>
      }
    >
      <p className="muted sg-body">{t.body}</p>
    </SideCard>
  )
}
