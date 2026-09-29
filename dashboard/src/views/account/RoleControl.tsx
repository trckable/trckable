// A person's role as two buttons, Owner | Viewer. Off on yourself and on the
// last owner; the tooltip says what a role is, or why it is off.
import { roleLock, type RoleLock } from './rules'
import { people } from './peopleCopy'
import type { Person } from '../../lib/api'

const ROLES = [
  { id: 'owner', label: people.owner },
  { id: 'viewer', label: people.viewer },
]

const LOCKS = { self: people.lockSelf, last: people.lockLast }

export function RoleControl({ p, me, owners, onPick }: { p: Person; me?: string; owners: number; onPick: (role: string) => void }) {
  const lock: RoleLock = roleLock(p, me, owners)
  const tip = lock ? LOCKS[lock] : people.roleTip
  return (
    <span className="role-seg" role="radiogroup" aria-label={people.roleOf(p.email)} title={tip}>
      {ROLES.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={p.role === r.id} disabled={lock !== null} onClick={() => p.role !== r.id && onPick(r.id)}>
          {r.label}
        </button>
      ))}
    </span>
  )
}
