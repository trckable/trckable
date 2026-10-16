// The Briefing takes the place of Data's numbers while it is the tab on. Only this
// small piece is in the first load; the Briefing itself is one lazy chunk.
import { lazy, Suspense } from 'react'
import { BriefingSkeleton } from '../ui/BriefingSkeleton'
import { copy } from '../copy'
import type { BriefingProps } from './Briefing'

const Briefing = lazy(() => import('./Briefing'))

export function BriefingSlot(p: BriefingProps) {
  return (
    <Suspense fallback={<BriefingSkeleton site={p.site.id} label={copy.loading} />}>
      <Briefing {...p} />
    </Suspense>
  )
}
