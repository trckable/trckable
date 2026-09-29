// The account window's API keys tab (views/Account): a key only reads, one per
// tool. The three tiles say what they are for; the rows say which are used.
import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { api, type APIKey } from '../../lib/api'
import { KeyRow } from './KeyRow'
import { KeyTiles } from './KeyTiles'
import { NewKeyRow } from './NewKeyRow'
import { keys as t } from './keysCopy'
import './people.css'

export function Keys() {
  const [list, setList] = useState<APIKey[] | null>(null)
  const [creating, setCreating] = useState(false)
  const load = () => void api.keys().then((r) => setList(r.keys ?? []))
  useEffect(() => {
    load()
  }, [])
  const used = list?.length ?? 0
  const empty = list !== null && used === 0 && !creating
  const create = (
    <button type="button" className="btn primary" disabled={used >= t.max} aria-expanded={creating} onClick={() => setCreating(true)}>
      <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
      {t.create}
    </button>
  )

  return (
    <section className="people" id="keys">
      {empty ? (
        <div className="key-empty">
          <KeyTiles />
          {create}
        </div>
      ) : (
        <>
          <div className="people-head">
            <span className="people-head-text">
              <h2>{t.title}</h2>
              <span className="faint num">{list ? t.count(used, t.max) : '…'}</span>
            </span>
            {!creating && create}
          </div>
          <KeyTiles />
        </>
      )}
      {!list && <Loading height={80} />}
      {(creating || used > 0) && (
        <div className="people-list">
          {creating && <NewKeyRow onClose={() => setCreating(false)} onCreated={load} />}
          {list?.map((k) => <KeyRow key={k.id} k={k} onRevoked={load} />)}
        </div>
      )}
    </section>
  )
}
