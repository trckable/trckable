// Where milestones meet the dashboard: the celebration and its side card when
// one is reached, and the timeline and share sheet, loaded only when opened
// (one lazy chunk).
import { Suspense, lazy, useEffect, useState } from 'react'
import type { Site } from '../../lib/api'
import type { MilestonesState } from './useMilestones'

/** The page gets a few seconds to itself before the card comes up. */
export const COME_MS = 4000

// The celebration shows after the milestones arrive, so it is its own chunk too.
const Celebration = lazy(() => import('./Celebration').then((m) => ({ default: m.Celebration })))
const MilestonesDialogs = lazy(() => import('./MilestonesDialogs'))

export function MilestonesSlot({ ms, site, quiet, revenue }: { ms: MilestonesState; site: Site; quiet: boolean; revenue: boolean }) {
  const m = ms.moment
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!m) return
    const t = setTimeout(() => setLate(true), COME_MS)
    return () => {
      clearTimeout(t)
      setLate(false)
    }
  }, [m])
  return (
    <>
      {m && late && !quiet && (
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
