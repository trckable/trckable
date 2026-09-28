// Which sites one viewer may see: all of them, or the ones ticked. Each
// change is saved at once.
import { Modal } from '../../components/Modal'
import type { SiteAccessList } from '../../lib/api'
import { copy } from './copy'
import type { SiteAccess } from './useSiteAccess'

type Viewer = SiteAccessList['viewers'][number]

export default function AccessDialog({ viewer, access, onClose }: { viewer: Viewer; access: SiteAccess; onClose: () => void }) {
  // The list is the server's latest: a save replaces it, and this row with it.
  const v = access.of(viewer.id) ?? viewer
  const some = v.sites !== null
  const chosen = new Set(v.sites ?? [])
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    access.save(v.id, [...next])
  }
  return (
    <Modal label={copy.editFor(v.email)} className="access-dialog" keepSize={false} onClose={onClose}>
      <h2>{copy.edit}</h2>
      <p className="faint access-who">{v.email}</p>
      <div className="seg" role="group" aria-label={copy.mode}>
        <button type="button" aria-pressed={!some} onClick={() => some && access.save(v.id, null)}>
          {copy.allOption}
        </button>
        <button type="button" aria-pressed={some} onClick={() => !some && access.save(v.id, [])}>
          {copy.someOption}
        </button>
      </div>
      {some && (
        <fieldset className="access-sites" aria-label={copy.sitesLabel}>
          {access.sites.map((s) => (
            <label key={s.id} className="access-site">
              <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} />
              <span>{s.name || s.domain}</span>
              {s.name && s.name !== s.domain && <span className="faint">{s.domain}</span>}
            </label>
          ))}
        </fieldset>
      )}
      <div className="access-actions">
        <button type="button" className="btn primary" onClick={onClose}>
          {copy.done}
        </button>
      </div>
    </Modal>
  )
}
