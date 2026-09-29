// A one-time password to pass on: for someone just added, or one whose
// password an owner reset. Shown once; trckable sends no email.
import { Check, Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { people } from './peopleCopy'

export function OneTimePassword({ email, password, reset, onClose }: { email: string; password: string; reset?: boolean; onClose: () => void }) {
  const t = people.otp
  const [copied, setCopied] = useState<'pw' | 'all' | null>(null)
  const copy = (what: 'pw' | 'all') => {
    const text = what === 'pw' ? password : t.message(location.origin, email, password)
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    })
  }
  return (
    <Modal label={t.label} className="person-modal" onClose={onClose}>
      <div className="modal-head">
        <span className="modal-badge" aria-hidden="true">
          <KeyRound size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2>{reset ? t.titleReset : t.titleNew}</h2>
          <span className="faint">{t.body(email)}</span>
        </div>
      </div>
      <div className="otp-box">
        <code>{password}</code>
        <button type="button" className="btn" onClick={() => copy('pw')}>
          {copied === 'pw' ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />}
          {copied === 'pw' ? t.copied : t.copy}
        </button>
      </div>
      <div className="person-actions">
        <button type="button" className="btn ghost" onClick={() => copy('all')}>
          {copied === 'all' ? t.copied : t.copyAll}
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          {t.done}
        </button>
      </div>
    </Modal>
  )
}
