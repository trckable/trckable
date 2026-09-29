// The People tab: who may use this instance. Owners run it, viewers read it,
// and the server enforces that, not this screen.
import { UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AllowedSites } from '../../features/access/AllowedSites'
import { useSiteAccess } from '../../features/access/useSiteAccess'
import { Loading } from '../../components/loading/Loading'
import { api, type Person } from '../../lib/api'
import { AddRow } from './AddRow'
import { OneTimePassword } from './OneTimePassword'
import { PersonRow } from './PersonRow'
import { copy } from './copy'
import { people as t } from './peopleCopy'
import { peopleActions } from './usePeopleActions'
import './people.css'

export function People({ me }: { me?: string }) {
  const [list, setList] = useState<Person[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [issued, setIssued] = useState<{ email: string; password: string; reset?: boolean } | null>(null)
  const [allowing, setAllowing] = useState<string | null>(null)
  const load = () => void api.people().then((r) => setList(r.people ?? []))
  const access = useSiteAccess(list)
  useEffect(() => {
    load()
  }, [])

  const owners = list?.filter((p) => p.role === 'owner').length ?? 0
  const act = { ...peopleActions({ load, setPeople: setList, issue: setIssued }), allow: setAllowing }

  // You first; then the people who use it; then the ones still to sign in.
  const waiting = (p: Person) => p.email !== me && (p.must_change || !p.last_seen)
  const sorted = [...(list ?? [])].sort((x, y) => (y.email === me ? 1 : 0) - (x.email === me ? 1 : 0) || (y.last_seen || 0) - (x.last_seen || 0))
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

      {allowing && <AllowedSites id={allowing} access={access} onClose={() => setAllowing(null)} />}
      {issued && <OneTimePassword {...issued} onClose={() => setIssued(null)} />}
    </section>
  )
}
