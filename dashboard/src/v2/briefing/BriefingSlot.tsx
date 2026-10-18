// The Briefing takes the place of Data's numbers while it is the tab on. Only this
// small piece is in the first load; the Briefing itself is one lazy chunk.
import { Suspense } from 'react'
import { lazyLoad } from '../../lib/lazyLoad'
import { PageHold } from '../../lib/pageLoading'
import { BriefingSkeleton } from '../ui/BriefingSkeleton'
import { copy } from '../copy'
import type { BriefingProps } from './Briefing'

// A chunk of its own, fetched when the page is idle (V2View), so the first switch to it has the code already.
export const Briefing = lazyLoad(() => import('./Briefing'))

export function BriefingSlot(p: BriefingProps) {
  return (
    <Suspense
      fallback={
        <>
          <PageHold />
          <BriefingSkeleton site={p.site.id} label={copy.loading} />
        </>
      }
    >
      <Briefing {...p} />
    </Suspense>
  )
}
