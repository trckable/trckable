// One person: avatar, name and email, role, the sites a viewer may see, a
// status icon and the ⋯ menu.
import { Clock, ShieldCheck } from 'lucide-react'
import { Menu } from '../../components/Menu'
import { SiteChips } from '../../features/access/SiteChips'
import type { SiteAccess } from '../../features/access/useSiteAccess'
import type { Person } from '../../lib/api'
import { openAccount } from '../../lib/account'
import { seenText } from '../personSeen'
import { RoleControl } from './RoleControl'
import { people } from './peopleCopy'

export interface RowActions {
  setRole: (p: Person, role: string) => void
  reset: (p: Person) => void
  turnOff: (p: Person) => void
  remove: (p: Person) => void
  allow: (id: string) => void
}

function statusOf(p: Person, waiting: boolean) {
  if (waiting) return { kind: 'waiting', Icon: Clock, text: people.status.waiting }
  if (p.two_step) return { kind: 'shield', Icon: ShieldCheck, text: people.status.twoStep }
  return { kind: 'dot', Icon: null, text: people.status.active }
}

function Status({ p, waiting }: { p: Person; waiting: boolean }) {
  const s = statusOf(p, waiting)
  const tip = waiting ? s.text : `${s.text} · ${seenText(p)}`
  return (
    <span className={'person-status ' + s.kind} role="img" aria-label={tip} title={tip}>
      {s.Icon && <s.Icon size={16} strokeWidth={1.75} aria-hidden="true" />}
    </span>
  )
}

function RowMenu({ p, self, access, act }: { p: Person; self: boolean; access: SiteAccess; act: RowActions }) {
  const m = people.menu
  const viewer = p.role !== 'owner'
  return (
    <Menu label={m.options(p.email)}>
      {(close) => {
        const item = (label: string, run: () => void, danger = false) => (
          <button key={label} type="button" role="menuitem" style={danger ? { color: 'var(--down)' } : undefined} onClick={() => {
              close()
              run()
            }}>
            {label}
          </button>
        )
        if (self) return item(m.profile, () => openAccount('profile'))
        return (
          <>
            {viewer && access.shown && access.of(p.id) && item(m.sites, () => act.allow(p.id))}
            {viewer && item(m.reset, () => act.reset(p))}
            {viewer && p.two_step && item(m.twoStepOff, () => act.turnOff(p))}
            {item(m.remove, () => act.remove(p), true)}
          </>
        )
      }}
    </Menu>
  )
}

export function PersonRow({ p, me, owners, waiting, access, act }: { p: Person; me?: string; owners: number; waiting: boolean; access: SiteAccess; act: RowActions }) {
  const self = p.email === me
  return (
    <div className={'person' + (self ? ' self' : '') + (waiting ? ' waiting' : '')}>
      <span className={'person-avatar' + (p.role === 'owner' ? ' owner' : '')} aria-hidden="true">
        {(p.name || p.email).slice(0, 1).toUpperCase()}
      </span>
      <span className="person-text">
        <span className="person-name">
          {p.name || p.email.split('@')[0]}
          {self && <span className="you">{people.you}</span>}
        </span>
        <span className="person-sub">{p.email}</span>
      </span>
      <span className="person-controls">
        <RoleControl p={p} me={me} owners={owners} onPick={(role) => act.setRole(p, role)} />
        {p.role !== 'owner' && <SiteChips id={p.id} email={p.email} access={access} onOpen={() => act.allow(p.id)} />}
        <Status p={p} waiting={waiting} />
      </span>
      <RowMenu p={p} self={self} access={access} act={act} />
    </div>
  )
}
