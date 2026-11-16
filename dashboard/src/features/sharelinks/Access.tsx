// Who can open the link: anyone who has it, or anyone who has it and the password.
import { Globe, Lock } from 'lucide-react'
import { useState } from 'react'
import { FieldError, fieldProps } from '../../kit/FieldError'
import { copy } from './copy'
import type { Access as Kind, Draft, Problem } from './logic'
import { Opt } from './Opt'

const ACCESS: { id: Kind; label: string; icon: typeof Globe }[] = [
  { id: 'public', label: copy.public, icon: Globe },
  { id: 'password', label: copy.password, icon: Lock },
]

export function Access({ draft, set, blocked }: { draft: Draft; set: (p: Partial<Draft>) => void; blocked: Problem | null }) {
  const [left, setLeft] = useState(false)
  const need = left && blocked?.field === 'password' ? blocked.text : null
  return (
    <Opt
      icon={<Lock size={15} strokeWidth={1.75} />}
      label={copy.mode}
      below={
        draft.access === 'password' && (
          <>
            <input
              className="input"
              type="password"
              aria-label={copy.password}
              autoComplete="new-password"
              placeholder={draft.hadPassword ? copy.passwordKeep : undefined}
              value={draft.password}
              onChange={(e) => set({ password: e.target.value })}
              onBlur={() => setLeft(true)}
              {...fieldProps('sl-password-err', need)}
            />
            <FieldError id="sl-password-err" error={need} />
          </>
        )
      }
    >
      <div className="seg small sl-access" role="group" aria-label={copy.mode}>
        {ACCESS.map((a) => (
          <button key={a.id} type="button" aria-pressed={draft.access === a.id} onClick={() => set({ access: a.id })}>
            <a.icon size={13} strokeWidth={1.75} aria-hidden="true" />
            {a.label}
          </button>
        ))}
      </div>
    </Opt>
  )
}
