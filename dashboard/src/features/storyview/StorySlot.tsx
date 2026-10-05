// Data's stage: over its numbers, the switch between the story and Explore.
// The story replaces Explore's numbers (children) while it is the view on show.
// Only this small piece is in the first load; the rest is one lazy chunk (StoryHost).
import { lazy, Suspense, type ReactNode } from 'react'
import { isShared } from '../../lib/me'
import type { Report } from '../../lib/api'
import type { ViewState } from '../../lib/url'
import { storyOn } from './mode'
import type { StoryHostProps } from './StoryHost'

const StoryHost = lazy(() => import('./StoryHost')) // the story, its switch and the way back from Explore: only where Data has numbers

/** What Dashboard hands over; the rest goes on to the host as it is. */
export type StorySlotProps = Omit<StoryHostProps, 'on' | 'from' | 'data'> & {
  view: ViewState
  data: Report | null
  /** Data has numbers to tell and is not on the install screen. */
  ready: boolean
  waiting: boolean
  children: ReactNode
}

export function StorySlot({ view, data, ready, waiting, children, ...rest }: StorySlotProps) {
  const switchOn = ready && !waiting && !isShared()
  const shown = switchOn && storyOn(view)
  return (
    <div className={waiting ? 'sleep view-stage waiting' : 'sleep view-stage'} aria-hidden={waiting || undefined} inert={waiting}>
      {switchOn && data && (
        <Suspense fallback={null}>
          <StoryHost {...rest} on={shown} from={view.story} data={data} />
        </Suspense>
      )}
      {!shown && children}
    </div>
  )
}
