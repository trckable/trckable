// Which link to copy, when the site has several: each by its name, a lock on the ones that ask for a password.
// One tap copies it and says its name.
import { CircleDollarSign, Lock, X } from 'lucide-react'
import type { Share } from '../../lib/apiMore'
import { nameOf } from '../sharelinks/copy'
import { copy } from './copy'

export function LinkPicker({ shares, onPick, onClose }: { shares: Share[]; onPick: (s: Share) => void; onClose: () => void }) {
  return (
    <div className="sd-pick" role="menu" aria-label={copy.pickLink}>
      <div className="sd-pick-head">
        <span>{copy.pickLink}</span>
        <button type="button" className="sd-pick-x" aria-label={copy.close} onClick={onClose}>
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {shares.map((s) => (
        <button key={s.id} type="button" role="menuitem" className="sd-pick-item" autoFocus={s === shares[0]} onClick={() => onPick(s)}>
          <span className="sd-pick-name">{nameOf(s)}</span>
          {s.revenue && <CircleDollarSign size={13} strokeWidth={1.75} role="img" aria-label={copy.pickRevenue} />}
          {s.has_password && <Lock size={13} strokeWidth={1.75} role="img" aria-label={copy.pickPassword} />}
        </button>
      ))}
    </div>
  )
}
