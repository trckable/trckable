// The two roles, each with one line of what it allows. The current one is
// ticked; the other one is a request, never a change (the confirmation follows).
import { Check } from 'lucide-react'
import type { RefObject } from 'react'
import { AnchoredPop } from '../../components/AnchoredPop'
import { people as t } from './peopleCopy'
import './peoplePop.css'

const ROLES = [
  { id: 'owner', ...t.roles.owner },
  { id: 'viewer', ...t.roles.viewer },
]

export default function RolePop({ anchor, role, onPick, onClose }: { anchor: RefObject<HTMLElement | null>; role: string; onPick: (role: string) => void; onClose: () => void }) {
  return (
    <AnchoredPop anchor={anchor} label={t.roleLabel} className="role-pop" onClose={onClose}>
      {(close) => (
        <div className="pop-list" role="menu" aria-label={t.roleLabel}>
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitemradio"
              aria-checked={role === r.id}
              data-nav
              data-autofocus={role === r.id || undefined}
              className="pop-role"
              onClick={() => {
                close()
                if (r.id !== role) onPick(r.id)
              }}
            >
              <span className="pop-role-name">
                {r.name}
                {role === r.id && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
              </span>
              <span className="faint">{r.what}</span>
            </button>
          ))}
        </div>
      )}
    </AnchoredPop>
  )
}
