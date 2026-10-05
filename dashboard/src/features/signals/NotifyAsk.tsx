// The question about browser notices, as a side card: it shows after the first
// sale this tab sees, once ever, and the browser's own question is only asked
// from the button on it.
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { cardModal } from '../../components/CardModal/copy'
import { SideCard } from '../../components/SideCard/SideCard'
import { toast } from '../../components/Toast'
import type { Sale } from '../../lib/api'
import { useSeen } from '../install/seen'
import { signals } from './copy'
import { askPermission, canNotify } from './notify'
import NotifyModal from './NotifyModal'
import { setPref } from './prefs'
import './signals.css'

const t = signals.card

export function NotifyAsk({ sale }: { sale?: Sale }) {
  const [seen, putAway] = useSeen('notify', '*')
  const [open, setOpen] = useState(false)
  if (!sale || seen || !canNotify() || Notification.permission !== 'default') return null
  const yes = () => {
    putAway()
    void askPermission().then((p) => {
      setPref('notify', p === 'granted')
      if (p === 'denied') toast(signals.blocked, 'warning')
    })
  }
  return (
    <>
      <SideCard
        id="notify"
        label={t.label}
        closeLabel={t.close}
        kind={{ icon: <Bell size={14} strokeWidth={2} />, label: t.label, tint: 'var(--accent)' }}
        title={t.title}
        onClose={putAway}
        actions={
          <button type="button" className="btn primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            {cardModal.details}
          </button>
        }
      >
        <p className="muted sg-body">{t.body}</p>
      </SideCard>
      {open && <NotifyModal sale={sale} onClose={() => setOpen(false)} onYes={yes} />}
    </>
  )
}
