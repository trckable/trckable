// Settings → Sharing → a link to this site's numbers for someone with
// no account. What it may show is decided on the server: hiding revenue means
// the figure is never asked for, not that the page leaves it out.
import { Link2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Info } from '../components/Info'
import { copy } from '../features/sharelinks/copy'
import { Created } from '../features/sharelinks/Created'
import { LinkRow } from '../features/sharelinks/LinkRow'
import { NewLink, type Made } from '../features/sharelinks/NewLink'
import { api, type Share, type Site } from '../lib/api'
import { isViewer } from '../lib/me'
import '../features/sharelinks/sharelinks.css'

export function Shares({ site }: { site: Site }) {
  const [list, setList] = useState<Share[] | null>(null)
  const [making, setMaking] = useState(false)
  const [made, setMade] = useState<Made | null>(null)
  const readOnly = isViewer()
  const load = () => api.shares(site.id).then((r) => setList(r.shares ?? [])).catch(() => setList([]))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is a new function every render; refetch only when the site changes
  }, [site.id])

  const empty = list?.length === 0
  const open = () => {
    setMade(null)
    setMaking(true)
  }

  return (
    <section className="card sl-card" id="shares">
      <div className="card-head">
        <h2>{copy.title}</h2>
        <Info text={copy.tip} />
        {!readOnly && !making && !empty && (
          <button type="button" className="btn primary sl-new-btn" onClick={open}>
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            {copy.newLink}
          </button>
        )}
      </div>

      {making && (
        <NewLink
          site={site}
          onClose={() => setMaking(false)}
          onMade={(m) => {
            setMaking(false)
            setMade(m)
            void load()
          }}
        />
      )}
      {made && <Created made={made} domain={site.domain} onDone={() => setMade(null)} />}

      {!list && <div className="skeleton" style={{ height: 54 }} />}
      {empty && !making && !made && (
        <div className="sl-empty">
          <Link2 size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>{copy.empty}</span>
          {!readOnly && (
            <button type="button" className="btn primary" onClick={open}>
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              {copy.newLink}
            </button>
          )}
        </div>
      )}
      {!!list?.length && (
        <ul className="sl-list">
          {list.map((s) => (
            <LinkRow key={s.id} site={site.id} share={s} readOnly={readOnly} onChanged={() => void load()} />
          ))}
        </ul>
      )}
    </section>
  )
}
