// The Briefing takes the place of Data's numbers while it is the tab on. Only this
// small piece is in the first load; the Briefing itself is one lazy chunk.
import { lazy, Suspense } from 'react'
import { Skeleton } from '../../components/skeleton/Skeleton'
import type { BriefingProps } from './Briefing'

const Briefing = lazy(() => import('./Briefing'))

export function BriefingSlot(p: BriefingProps) {
  return (
    <Suspense fallback={<Skeleton height={420} />}>
      <Briefing {...p} />
    </Suspense>
  )
}
