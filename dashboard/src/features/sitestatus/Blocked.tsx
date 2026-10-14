import { useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { copy } from './copy'
import { downCopy } from './downCopy'

/** A site whose firewall blocks our look: a badge that says so plainly, since we can tell neither that it is up nor that it is down. */
export function Blocked() {
  const [open, setOpen] = useState(false)
  return (
    <div className="status-float">
      {open && (
        <div className="status-pop" role="dialog" aria-label={copy.label}>
          <p className="status-card sgm-honest muted">{downCopy.blocked}</p>
        </div>
      )}
      <button type="button" className="status-badge quiet" aria-expanded={open} title={copy.label} onClick={() => setOpen((o) => !o)}>
        <CircleAlert size={15} strokeWidth={2} aria-hidden="true" />
        {downCopy.blockedBadge}
      </button>
    </div>
  )
}
