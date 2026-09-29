// A viewer's site access on their People row as small chips: All sites, or up
// to three names and "+N". A summary only: changing it is the person's ⋯ menu
// (Allowed sites). Shown only when the account has more than one site.
import { siteChips } from '../../views/account/rules'
import { people } from '../../views/account/peopleCopy'
import { copy } from './copy'
import type { SiteAccess } from './useSiteAccess'
import './access.css'

export function SiteChips({ id, email, access, onOpen }: { id: string; email: string; access: SiteAccess; onOpen: () => void }) {
  const v = access.of(id)
  if (!access.shown || !v) return null
  const c = siteChips(v.sites, access.sites)
  return (
    <button type="button" className="site-chips" aria-label={copy.editFor(email)} onClick={onOpen}>
      {c.all && <span className="chip">{copy.all}</span>}
      {c.none && <span className="chip quiet">{copy.none}</span>}
      {c.names.map((n) => (
        <span key={n} className="chip">
          {n}
        </span>
      ))}
      {c.more > 0 && <span className="chip quiet">{people.more(c.more)}</span>}
    </button>
  )
}
