// Where milestones meet the dashboard: the moment above the numbers, and
// the timeline and share sheet, loaded only when opened (one lazy chunk).
import { Suspense, lazy } from 'react'
import type { Site } from '../../lib/api'
import { Moment } from './Moment'
import type { MilestonesState } from './useMilestones'

const MilestonesDialogs = lazy(() => import('./MilestonesDialogs'))

export function MilestonesSlot({ ms, site, quiet }: { ms: MilestonesState; site: Site; quiet: boolean }) {
  const m = ms.moment
  return (
    <>
      {m && !quiet && <Moment key={m.kind + m.step} m={m} onClose={ms.close} onShare={() => ms.setOpen({ share: m })} />}
      {ms.open && (
        <Suspense fallback={null}>
          <MilestonesDialogs ms={ms} site={site} />
        </Suspense>
      )}
    </>
  )
}
