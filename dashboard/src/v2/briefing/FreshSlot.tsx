// The page of a site that has had no visit yet is its own chunk: only a new site ever loads it.
import { lazy, Suspense } from 'react'
import type { Site, Visit } from '../../lib/api'
import { BriefingSkeleton } from '../ui/BriefingSkeleton'
import { copy } from '../copy'

const Fresh = lazy(() => import('./Fresh'))

export function FreshSlot({ site, visits }: { site: Site; visits: Visit[] }) {
  return (
    <Suspense fallback={<BriefingSkeleton site={site.id} label={copy.loading} />}>
      <Fresh site={site} visits={visits} />
    </Suspense>
  )
}
