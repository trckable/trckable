// The People tab: who may use this instance. Owners run it, viewers read it,
// and the server enforces that, not this screen.
import { UserPlus } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { AllowedSites } from '../../features/access/AllowedSites'
import { useSiteAccess } from '../../features/access/useSiteAccess'
import { Loading } from '../../components/loading/Loading'
import { whenIdle } from '../../lib/lazyLoad'
import type { Person } from '../../lib/api'
import { peopleApi } from '../../lib/peopleApi'
import { AddRow } from './AddRow'
import { OneTimePassword } from './OneTimePassword'
import { PersonRow } from './PersonRow'
import { RoleDialog, RolePop, SitesPop } from './peopleLazy'
import { copy } from './copy'
import { people as t } from './peopleCopy'
import { orderPeople } from './rules'
import { peopleActions } from './usePeopleActions'
import './people.css'

export function People({ me }: { me?: string }) {
  const [list, setList] = useState<Person[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [issued, setIssued] = useState<{ email: string; password: string; reset?: boolean } | null>(null)
  const [allowing, setAllowing] = useState<string | null>(null)
  // A role change asked for, and the pill it came from (focus goes back there).
  const [asking, setAsking] = useState<{ p: Person; role: string } | null>(null)
  // Also runs on every profile change: a failed answer keeps the list on screen.
  const load = () => void peopleApi.people().then((r) => setList(r.people ?? [])).catch(() => {})
  const access = useSiteAccess(list)
  useEffect(() => {
    load()
    // The popovers and the confirmation are fetched now, before anyone clicks.
    whenIdle(SitesPop.preload)
    whenIdle(RolePop.preload)
    whenIdle(RoleDialog.preload)
    // A new name or picture (yours, from the profile) shows here at once.
    window.addEventListener('trckable:profile', load)
    return () => window.removeEventListener('trckable:profile', load)
  }, [])

  const owners = list?.filter((p) => p.role === 'owner').length ?? 0
  const act = { ...peopleActions({ load, setPeople: setList, issue: setIssued }), allow: setAllowing, askRole: (p: Person, role: string) => setAsking({ p, role }) }

  // You first, then the owners, then the viewers; the ones still to sign in last, in their own group.
  const waiting = (p: Person) => p.email !== me && (p.must_change || !p.last_seen)
  const sorted = orderPeople(list ?? [], me)
  const row = (p: Person) => <PersonRow key={p.id} p={p} me={me} owners={owners} waiting={waiting(p)} access={access} act={act} />
  const pending = sorted.filter(waiting)

  return (
    <section className="people" id="people">
      <div className="people-head">
        <span className="people-head-text">
          <h2>{t.title}</h2>
          <span className="faint num">{list ? copy.count({ people: list.length, owners, viewers: list.length - owners }) : '…'}</span>
        </span>
        <button type="button" className="btn primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
          {t.add}
        </button>
      </div>

      {!list && <Loading height={120} />}
      {list && (
        <div className="people-list">
          {adding && (
            <AddRow
              onClose={() => setAdding(false)}
              onAdded={(made) => {
                setAdding(false)
                load()
                if (made.password) setIssued(made)
              }}
            />
          )}
          {sorted.filter((p) => !waiting(p)).map(row)}
        </div>
      )}
      {pending.length > 0 && (
        <div className="people-group">
          <span className="people-group-head">{t.waiting}</span>
          <div className="people-list">{pending.map(row)}</div>
        </div>
      )}

      {asking && (
        <Suspense fallback={null}>
          <RoleDialog p={asking.p} role={asking.role} run={() => act.setRole(asking.p, asking.role)} onClose={() => setAsking(null)} />
        </Suspense>
      )}
      {allowing && <AllowedSites id={allowing} access={access} onClose={() => setAllowing(null)} />}
      {issued && <OneTimePassword {...issued} onClose={() => setIssued(null)} />}
    </section>
  )
}
