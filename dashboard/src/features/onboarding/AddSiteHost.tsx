// Adding a site: with none yet it is the first run (Onboarding, three
// steps); otherwise the add-site wizard. The answer is taken when it opens
// and kept, since the first site arrives half way through the first run.
// Both load on demand.
import { lazy, Suspense, useState } from 'react'
import type { Site } from '../../lib/api'
import { closeAddSite } from '../../lib/account'

const AddWizard = lazy(() => import('../install/AddWizard').then((m) => ({ default: m.AddWizard })))
const Onboarding = lazy(() => import('./Onboarding'))

export function AddSiteHost({ open, sites, onSites }: { open: boolean; sites: Site[]; onSites: () => Promise<unknown> }) {
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  if (open && firstRun === null) setFirstRun(sites.length === 0)
  if (!open && firstRun !== null) setFirstRun(null)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      {firstRun ? <Onboarding onClose={closeAddSite} onSites={onSites} /> : <AddWizard onClose={closeAddSite} onSites={onSites} />}
    </Suspense>
  )
}
