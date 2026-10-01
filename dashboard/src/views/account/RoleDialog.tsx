// The question before a role changes: what it means for them. A new owner
// takes one tick ("I trust them with all of this"); a viewer is a plain
// confirm. The change runs from inside; a refusal shows here and the dialog
// stays. Enter confirms only while the button is on.
import { Check, Globe, KeyRound, Lock, UserPlus, Eye, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DialogActions } from '../../components/DialogActions'
import { DialogHead } from '../../components/DialogHead'
import { Modal } from '../../components/Modal'
import { fail, type Person } from '../../lib/api'
import { people } from './peopleCopy'
import './peoplePop.css'
import './roleDialog.css'

const t = people.change
const OWNER_ICONS: LucideIcon[] = [Globe, UserPlus, KeyRound]
const VIEWER_ICONS: LucideIcon[] = [Lock, Eye]

export default function RoleDialog({ p, role, run, onClose }: { p: Person; role: string; run: () => Promise<unknown>; onClose: () => void }) {
  const [trusted, setTrusted] = useState(false)
  const [busy, setBusy] = useState(false)
  const promote = role === 'owner'
  const name = p.name || p.email.split('@')[0]
  const title = promote ? t.ownerTitle(name) : t.viewerTitle(name)
  const lines = promote ? t.ownerLines : t.viewerLines
  const icons = promote ? OWNER_ICONS : VIEWER_ICONS
  const go = promote ? t.ownerGo : t.viewerGo
  const allowed = !busy && (!promote || trusted)
  // A viewer is one plain confirm: Enter lands on it. (Not autoFocus: the
  // dialog notes what had focus before it opened, and must see the pill.)
  const goBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (promote) return
    const f = requestAnimationFrame(() => goBtn.current?.focus())
    return () => cancelAnimationFrame(f)
  }, [promote])
  const submit = () => {
    if (!allowed) return
    setBusy(true)
    run()
      .then(onClose)
      .catch((e: unknown) => {
        fail(e)
        setBusy(false)
      })
  }
  return (
    <Modal label={title} className="role-modal" onClose={busy ? undefined : onClose}>
      <form
        className="role-body"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <DialogHead icon={promote ? KeyRound : Eye} heading={title} />
        <ul className="role-lines">
          {lines.map((l, i) => {
            const Icon = icons[i]
            return (
              <li key={l}>
                <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                {l}
              </li>
            )
          })}
        </ul>
        {promote && (
          <button type="button" role="checkbox" aria-checked={trusted} className="role-trust" disabled={busy}
            onClick={() => setTrusted((v) => !v)}
            onKeyDown={(e) => {
              // Enter ticks it, and once it is ticked Enter confirms; Space toggles as on any checkbox.
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (trusted) submit()
              else setTrusted(true)
            }}
          >
            <span className={'pop-box' + (trusted ? ' on' : '')} aria-hidden="true">
              {trusted && <Check size={12} strokeWidth={3} />}
            </span>
            {t.trust}
          </button>
        )}
        <DialogActions
          left={
            <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
              {t.cancel}
            </button>
          }
        >
          <button ref={goBtn} type="submit" className="btn primary" disabled={!allowed}>
            {busy && <span className="btn-spin" aria-hidden="true" />}
            {busy ? t.busy : go}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
