// One line of the account window's Account section: an icon, what it is,
// and its control.
import type { Globe } from 'lucide-react'
import { RowLabel } from '../components/Switch'
import '../components/Row.css'

export function Line({ icon: Icon, label, hint, children, id }: { icon: typeof Globe; label: string; hint?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div className="srow acct-line" id={id}>
      <span className="icon-tile" aria-hidden="true">
        <Icon size={17} strokeWidth={1.75} />
      </span>
      <div className="srow-text">
        <b>{label}</b>
        {hint && <span className="faint">{hint}</span>}
      </div>
      {children && (
        <div className="srow-ctl">
          <RowLabel.Provider value={label}>{children}</RowLabel.Provider>
        </div>
      )}
    </div>
  )
}
