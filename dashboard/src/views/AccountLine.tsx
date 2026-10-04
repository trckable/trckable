// One line of the account window's Account section: an icon, what it is,
// and its control.
import { KeyRound, type Globe } from 'lucide-react'
import { RowLabel } from '../components/Switch'
import '../components/Row.css'
import { ssoCopy } from './ssoCopy'

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

/** Read-only: which identity provider this browser signed in with, when it did not use a password. */
export function SignedInWith({ provider }: { provider?: string }) {
  if (!provider) return null
  return <Line icon={KeyRound} label={ssoCopy.signedInWith(provider)} />
}
