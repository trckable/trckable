// The top of every dialog: its title, and at most one short line under it.
// Anything longer belongs in `help`, a small "?" tooltip beside the title, or
// in a link to the docs. An icon tile is optional, for dialogs that have one.
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Info } from './Info'
import './DialogHead.css'

export function DialogHead({ icon: Icon, heading, hint, help, danger }: { icon?: LucideIcon; heading: ReactNode; hint?: ReactNode; help?: string; danger?: boolean }) {
  return (
    <div className="dlg-head">
      {Icon && (
        <span className={'modal-badge' + (danger ? ' danger' : '')} aria-hidden="true">
          <Icon size={19} strokeWidth={1.75} />
        </span>
      )}
      <div className="dlg-head-text">
        <h2>
          {heading}
          {help && <Info text={help} />}
        </h2>
        {hint && <span className="faint">{hint}</span>}
      </div>
    </div>
  )
}
