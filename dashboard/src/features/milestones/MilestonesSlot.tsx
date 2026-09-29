// Where milestones meet the dashboard: the moment above the numbers, and
// the timeline and share sheet, loaded only when opened (one lazy chunk).
import { Suspense, lazy } from 'react'
import type { Site } from '../../lib/api'
import type { MilestonesState } from './useMilestones'

// The moment shows after the milestones arrive, so it is its own chunk too.
const Moment = lazy(() => import('./Moment').then((m) => ({ default: m.Moment })))
const MilestonesDialogs = lazy(() => import('./MilestonesDialogs'))

export function MilestonesSlot({ ms, site, quiet, revenue }: { ms: MilestonesState; site: Site; quiet: boolean; revenue: boolean }) {
  const m = ms.moment
  return (
    <>
      {m && !quiet && (
        <Suspense fallback={null}>
          <Moment key={m.kind + m.step} m={m} onClose={ms.close} onShare={() => ms.setOpen({ share: m })} />
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
