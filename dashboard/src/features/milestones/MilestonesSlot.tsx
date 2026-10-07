// Where milestones meet the dashboard: the celebration and its side card when
// one is reached, and the timeline and share sheet, loaded only when opened
// (one lazy chunk).
import { Suspense, lazy } from 'react'
import type { Site } from '../../lib/api'
import type { MilestonesState } from './useMilestones'

// The celebration shows after the milestones arrive, so it is its own chunk too.
const Celebration = lazy(() => import('./Celebration').then((m) => ({ default: m.Celebration })))
const MilestonesDialogs = lazy(() => import('./MilestonesDialogs'))

export function MilestonesSlot({ ms, site, quiet, revenue }: { ms: MilestonesState; site: Site; quiet: boolean; revenue: boolean }) {
  const m = ms.moment
  return (
    <>
      {m && !quiet && (
        <Suspense fallback={null}>
          <Celebration key={m.kind + m.step} m={m} list={ms.data?.milestones ?? []} site={site.id} domain={site.domain} onClose={ms.close} onShare={() => ms.setOpen({ share: m })} />
        </Suspense>
      )}
      {ms.open && (
        <Suspense fallback={null}>
          <MilestonesDialogs ms={ms} site={site} revenue={revenue} />
        </Suspense>
      )}
    </>
  )
}
