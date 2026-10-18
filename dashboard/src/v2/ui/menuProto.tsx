// Prototype of a slimmer site menu (development only; not for merge): ?menu=a, or current for today's. A: the account is a thin line
// (its name and a chevron) at the top; pressing it swaps the menu, in place, for the account list with a Back row.
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { protoParams, type MenuVariant } from '../../dev/fixture/proto'
import type { Workspace } from './WorkspaceRow'

export const menuVariant = (): MenuVariant | null => (import.meta.env.DEV ? protoParams().menu : null)
/** The slim menu's cuts (one line a site, no key hints, a short foot). */
export const slimMenu = (): boolean => menuVariant() === 'a'

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

/** The thin line at the top of the menu: the account's name and a chevron. */
export function ThinAccount({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" data-stop className="ws-thin" onClick={onOpen}>
      <span>{ACCOUNTS[0].name}</span>
      <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
    </button>
  )
}

/** What takes the menu's place while the account line is open. */
export function AccountView({ back, close }: { back: () => void; close: () => void }) {
  return (
    <div className="sitelist">
      <button type="button" data-stop className="ws-thin back" onClick={back}>
        <ChevronLeft size={12} strokeWidth={2} aria-hidden="true" />
        <span>Back</span>
      </button>
      <Accounts close={close} />
    </div>
  )
}
