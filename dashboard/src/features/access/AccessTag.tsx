// A viewer's site access on their People row: All sites, or how many. A click opens
// the picker (AccessDialog).
import { lazy, Suspense, useState } from 'react'
import { copy } from './copy'
import type { SiteAccess } from './useSiteAccess'
import './access.css'

const AccessDialog = lazy(() => import('./AccessDialog'))

export function AccessTag({ id, access }: { id: string; access: SiteAccess }) {
  const [open, setOpen] = useState(false)
  const v = access.of(id)
  if (!access.shown || !v) return null
  const label = tagText(v.sites, access.sites.length)
  return (
    <>
      <button type="button" className="tag quiet access-tag" title={copy.edit} aria-label={`${copy.editFor(v.email)}: ${label}`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Suspense fallback={null}>
          <AccessDialog viewer={v} access={access} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}

function tagText(sites: string[] | null, of: number) {
  if (sites === null) return copy.all
  if (sites.length === 0) return copy.none
  return copy.some(sites.length, of)
}
