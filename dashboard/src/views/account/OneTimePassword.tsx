// A one-time password to pass on: for someone just added, or one whose
// password an owner reset. Shown once; trckable sends no email.
import { Check, Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../../kit/Modal'
import { ModalMark } from '../../kit/ModalMark'
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
    <Modal
      label={t.label}
      onClose={onClose}
      frame={{
        title: reset ? t.titleReset : t.titleNew,
        subtitle: t.hint(email),
        help: t.help,
        icon: <ModalMark icon={KeyRound} />,
        size: 'sm',
        cancel: false,
        extra: (
          <button type="button" className="btn ghost" onClick={() => copy('all')}>
            {copied === 'all' ? t.copied : t.copyAll}
          </button>
        ),
        actions: (
          <button type="button" className="btn primary" onClick={onClose}>
            {t.done}
          </button>
        ),
      }}
    >
      <div className="otp-box">
        <code>{password}</code>
        <button type="button" className="btn" onClick={() => copy('pw')}>
          {copied === 'pw' ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.75} aria-hidden="true" />}
          {copied === 'pw' ? t.copied : t.copy}
        </button>
      </div>
    </Modal>
  )
}
