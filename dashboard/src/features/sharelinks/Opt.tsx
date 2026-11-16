// One row of the link's options: its icon, its name and its control, with room
// below for a field the control opens.
import type { ReactNode } from 'react'

export function Opt({ icon, label, children, below }: { icon: ReactNode; label: string; children: ReactNode; below?: ReactNode }) {
  return (
    <div className="sl-opt">
      <span className="sl-opt-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sl-opt-label">{label}</span>
      <div className="sl-opt-control">{children}</div>
      {below && <div className="sl-opt-below">{below}</div>}
    </div>
  )
}
