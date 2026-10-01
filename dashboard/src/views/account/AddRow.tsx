// Adding someone: one row that opens at the top of the list, an email and
// Owner | Viewer. The password to pass on follows in its own dialog.
import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { api, fail } from '../../lib/api'
import { people } from './peopleCopy'

export function AddRow({ onClose, onAdded }: { onClose: () => void; onAdded: (made: { email: string; password: string }) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const ok = email.includes('@')

  const create = () => {
    setBusy(true)
    api
      .addPerson(email.trim(), role)
      .then((r) => onAdded({ email: r.person.email, password: r.password }))
      .catch((e: unknown) => fail(e, create))
      .finally(() => setBusy(false))
  }

  const leave = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || busy) return
    e.stopPropagation()
    onClose()
  }
  return (
    <form
      className="person add-row"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok && !busy) create()
      }}
    >
      <input className="input" type="email" aria-label={people.emailLabel} value={email} autoFocus placeholder={people.emailPlaceholder} onKeyDown={leave} onChange={(e) => setEmail(e.target.value)} />
      <span className="role-seg" role="radiogroup" aria-label={people.roleLabel} title={people.roleTip}>
        {[
          { id: 'owner', label: people.owner },
          { id: 'viewer', label: people.viewer },
        ].map((r) => (
          <button key={r.id} type="button" role="radio" aria-checked={role === r.id} onClick={() => setRole(r.id)}>
            {r.label}
          </button>
        ))}
      </span>
      <button type="submit" className="btn primary" disabled={busy || !ok}>
        {busy ? people.adding : people.addGo}
      </button>
      <button type="button" className="btn icon ghost" aria-label={people.cancel} disabled={busy} onClick={onClose}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </form>
  )
}
