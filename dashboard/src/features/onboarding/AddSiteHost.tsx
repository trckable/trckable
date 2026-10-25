// Adding a site: with no verified one yet it is the first run (Onboarding, three
// steps); otherwise the add-site wizard. The answer is taken when it opens
// and kept, since the first site arrives half way through the first run.
// Both load on demand.
import { lazy, Suspense, useState } from 'react'
import type { Site } from '../../lib/api'
import { addSitePrefill, closeAddSite } from '../../lib/account'

const AddWizard = lazy(() => import('../install/AddWizard').then((m) => ({ default: m.AddWizard })))
const Onboarding = lazy(() => import('./Onboarding'))

export function AddSiteHost({ open, required = false, onPassed, sites, onSites }: { open: boolean; required?: boolean; onPassed?: (skipped: boolean) => void; sites: Site[]; onSites: () => Promise<unknown> }) {
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  const [prefill, setPrefill] = useState(addSitePrefill)
  if (open && prefill === null && addSitePrefill() !== null) setPrefill(addSitePrefill())
  if (!open && prefill !== null) setPrefill(null)
  if (open && firstRun === null) setFirstRun(required || sites.length === 0)
  if (!open && firstRun !== null) setFirstRun(null)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      {firstRun ? <Onboarding
          required={required}
          prefill={prefill}
          resume={required ? sites : undefined}
          onClose={(skipped) => {
            closeAddSite()
            if (required) onPassed?.(skipped)
          }}
          onSites={onSites}
        /> : <AddWizard prefill={prefill} onClose={closeAddSite} onSites={onSites} sites={sites} />}
    </Suspense>
  )
}
