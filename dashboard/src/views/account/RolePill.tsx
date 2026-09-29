// A person's role as a pill: Owner in the accent, Viewer quiet. It opens a
// popover with the two roles; picking the other one only ever asks (the
// confirmation is People's). Off on the last owner and on yourself, and the
// tooltip says why.
import { ChevronDown } from 'lucide-react'
import { Suspense, useRef, useState } from 'react'
import type { Person } from '../../lib/api'
import { people } from './peopleCopy'
import { RolePop } from './peopleLazy'
import { roleLock, type RoleLock } from './rules'

const LOCKS: Record<Exclude<RoleLock, null>, string> = { self: people.lockSelf, last: people.lockLast }

export function RolePill({ p, me, owners, onAsk }: { p: Person; me?: string; owners: number; onAsk: (role: string) => void }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const lock = roleLock(p, me, owners)
  const name = p.role === 'owner' ? people.roles.owner.name : people.roles.viewer.name
  const label = people.rolePill(p.email, name) + (lock ? '. ' + LOCKS[lock] : '')
  return (
    // The tooltip sits on a wrapper: a disabled button shows none in every browser.
    <span className="role-wrap" title={lock ? LOCKS[lock] : people.roleTip}>
      <button
        ref={btn}
        type="button"
        className={'role-pill' + (p.role === 'owner' ? ' owner' : '')}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={lock !== null}
        onPointerEnter={RolePop.preload}
        onFocus={RolePop.preload}
        onClick={() => setOpen((o) => !o)}
      >
        {name}
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <RolePop
            anchor={btn}
            role={p.role}
            onPick={onAsk}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </span>
  )
}
