// Adding someone: one row that opens at the top of the list, an email and
// Owner | Viewer. The password to pass on follows in its own dialog.
import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { FieldError, fieldProps } from '../../kit/FieldError'
import { more } from '../../lib/apiMore'
import { formWords } from '../../lib/formWords'
import { people } from './peopleCopy'

export function AddRow({ onClose, onAdded }: { onClose: () => void; onAdded: (made: { email: string; password: string }) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const ok = email.includes('@')

  const create = () => {
    setBusy(true)
    setProblem(null)
    more
      .addPerson(email.trim(), role)
      .then((r) => onAdded({ email: r.person.email, password: r.password }))
      .catch((e: unknown) => setProblem(formWords(e, { 500: people.failed, 502: people.failed, 503: people.failed })))
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
        if (busy) return
        if (ok) create()
        else setProblem(people.emailBad)
      }}
    >
      <input className="input" type="email" aria-label={people.emailLabel} value={email} autoFocus placeholder={people.emailPlaceholder} onKeyDown={leave} onChange={(e) => { setEmail(e.target.value); setProblem(null) }} {...fieldProps('add-person-err', problem)} />
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
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? people.adding : people.addGo}
      </button>
      <button type="button" className="btn icon ghost" aria-label={people.cancel} disabled={busy} onClick={onClose}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <FieldError id="add-person-err" error={problem} />
    </form>
  )
}
