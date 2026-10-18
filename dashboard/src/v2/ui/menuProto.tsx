// Prototype of a slimmer site menu (development only; not for merge): ?menu=a|b|c, or current for today's. A: a thin account line that
// opens a flyout at the side. B: the same line, opening the accounts in place above the sites. C: no line; the accounts are in the
// avatar's menu. The cuts all three share (one line a site, no key hints, a short foot) are in SiteList, SiteRow and AllRow.
import { useRef, useState, type ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { protoParams, type MenuVariant } from '../../dev/fixture/proto'
import type { Workspace } from './WorkspaceRow'

export const menuVariant = (): MenuVariant | null => (import.meta.env.DEV ? protoParams().menu : null)
/** The three slim versions share the cuts; today's menu is the baseline. */
export const slimMenu = (): boolean => {
  const v = menuVariant()
  return !!v && v !== 'current'
}

const ACCOUNTS = [
  { id: 'personal', name: 'Personal', sites: 4 },
  { id: 'studio', name: 'Studio Kalendar', sites: 3 },
]
const MANAGE = 'Manage accounts'

function Mark({ name }: { name: string }) {
  return (
    <span className="acct-mk" aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  )
}

function Accounts({ close }: { close: () => void }) {
  return (
    <>
      {ACCOUNTS.map((a, i) => (
        <button key={a.id} type="button" data-stop className="mi acct" onClick={close}>
          <Mark name={a.name} />
          <span className="mt2">
            <div className="nm">{a.name}</div>
            <div className="d">{`${a.sites} sites`}</div>
          </span>
          {i === 0 && <Check size={14} strokeWidth={2} aria-hidden="true" />}
        </button>
      ))}
      <button type="button" data-stop className="mi acct manage" onClick={close}>
        {MANAGE}
      </button>
    </>
  )
}

/** Today's account line, with accounts opening in place (the baseline). */
export const currentWorkspace: Workspace = {
  name: 'Personal',
  d: '4 sites',
  mark: <Mark name="Personal" />,
  accounts: (close) => <Accounts close={close} />,
}

/** A and B: a thin line, "Personal ›". A opens a flyout at the side, B the accounts in place. */
export function ThinAccount({ kind, close }: { kind: 'a' | 'b'; close: () => void }) {
  const [open, setOpen] = useState(false)
  const line = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={line} type="button" data-stop className={`ws-thin${open ? ' open' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{ACCOUNTS[0].name}</span>
        <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && kind === 'b' && (
        <div className="ws-list">
          <Accounts close={close} />
        </div>
      )}
      {open && kind === 'a' && (
        <div className="proto-fly" role="group" aria-label="Accounts">
          <button type="button" data-stop className="ws-thin back" onClick={() => setOpen(false)}>
            {'‹ Sites'}
          </button>
          <Accounts close={close} />
        </div>
      )}
    </>
  )
}

/** C: the accounts at the top of the avatar's menu. */
export function AvatarAccounts({ go }: { go: (fn: () => void) => () => void }): ReactNode {
  if (menuVariant() !== 'c') return null
  return (
    <div className="proto-accts">
      {ACCOUNTS.map((a, i) => (
        <button key={a.id} type="button" role="menuitem" onClick={go(() => {})}>
          <Mark name={a.name} />
          {a.name}
          {i === 0 && <Check size={14} strokeWidth={2} aria-hidden="true" className="acct-on" />}
        </button>
      ))}
      <button type="button" role="menuitem" onClick={go(() => {})}>
        <span className="acct-mk ghost" aria-hidden="true" />
        {MANAGE}
      </button>
    </div>
  )
}
