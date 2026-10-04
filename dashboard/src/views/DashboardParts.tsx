// Dashboard parts that are not on every first screen, each its own chunk.
// The notice for a site that stopped is fetched the moment it is drawn, while
// the numbers under it are still on their way.
// (The filter chips are in the header's second row, its own chunk.)
import { Suspense, type ComponentProps } from 'react'
import { lazyLoad } from '../lib/lazyLoad'

const Stopped = lazyLoad(() => import('../components/StoppedNotice').then((m) => ({ default: m.StoppedNotice })))
const Note = lazyLoad(() => import('./Notices'))

export function StoppedNotice(p: ComponentProps<typeof Stopped>) {
  return (
    <Suspense fallback={null}>
      <Stopped {...p} />
    </Suspense>
  )
}


/** What stands beside the numbers, and is wanted rarely: a failed report, a store still opening, test payments, the invitation to Full, the estimate note. One chunk, fetched when one of them is shown. */
export function Notice(p: ComponentProps<typeof Note>) {
  return (
    <Suspense fallback={null}>
      <Note {...p} />
    </Suspense>
  )
}
