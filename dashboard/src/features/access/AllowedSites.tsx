// A person's Allowed sites popup, fetched when it is first opened, saved with
// the server's answer and a toast.
import { lazy, Suspense } from 'react'
import { toast } from '../../components/Toast'
import { copy } from './copy'
import type { SiteAccess } from './useSiteAccess'

const AccessDialog = lazy(() => import('./AccessDialog'))

export function AllowedSites({ id, access, onClose }: { id: string; access: SiteAccess; onClose: () => void }) {
  const viewer = access.of(id)
  if (!viewer) return null
  return (
    <Suspense fallback={null}>
      <AccessDialog viewer={viewer} sites={access.sites} onSave={(sites) => access.save(id, sites).then(() => toast(copy.saved(viewer.email)))} onClose={onClose} />
    </Suspense>
  )
}
