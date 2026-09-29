// A viewer's site access on their People row, as a small muted summary: All
// sites, or how many. Changing it is the person's ⋯ menu (Allowed sites).
import { copy } from './copy'
import type { SiteAccess } from './useSiteAccess'
import './access.css'

export function AccessTag({ id, access }: { id: string; access: SiteAccess }) {
  const v = access.of(id)
  if (!access.shown || !v) return null
  return <span className="tag quiet access-tag">{summary(v.sites, access.sites.length)}</span>
}

export function summary(sites: string[] | null, of: number) {
  if (sites === null) return copy.all
  if (sites.length === 0) return copy.none
  return copy.some(sites.length, of)
}
