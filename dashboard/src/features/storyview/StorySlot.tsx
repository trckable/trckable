// Data's stage: over its numbers, the switch between the story and Explore.
// The story replaces Explore's numbers (children) while it is the view on show.
// Only this small piece is in the first load; the rest is one lazy chunk (StoryHost).
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loading } from '../../components/loading/Loading'
import { StorySkeleton } from '../../components/skeleton/DashSkeleton'
import { isShared } from '../../lib/me'
import type { Report } from '../../lib/api'
import type { ViewState } from '../../lib/url'
import { storyOn } from './mode'
import { slot } from './slotCopy'
import type { StoryHostProps } from './StoryHost'

const StoryHost = lazy(() => import('./StoryHost')) // the story, its switch and the way back from Explore: only where Data has numbers

/** What Dashboard hands over; the rest goes on to the host as it is. */
export type StorySlotProps = Omit<StoryHostProps, 'on' | 'from' | 'data'> & {
  view: ViewState
  data: Report | null
  /** Data has numbers to tell and is not on the install screen. */
  ready: boolean
  waiting: boolean
  /** The report for the current address is on its way. */
  loading: boolean
  children: ReactNode
}

/** The shortest the veil stays, so a fast answer does not flash it. */
const MIN_MS = 320

/** True from a switch between the story and Explore (or a story link) until
    the new numbers are in and the veil has been up long enough to read. */
function useSwitching(key: string, loading: boolean): boolean {
  const [on, setOn] = useState(false)
  const last = useRef(key)
  const since = useRef(0)
  useEffect(() => {
    if (last.current === key) return
    last.current = key
    since.current = Date.now()
    setOn(true)
  }, [key])
  useEffect(() => {
    if (!on || loading) return
    const t = setTimeout(() => setOn(false), Math.max(0, MIN_MS - (Date.now() - since.current)))
    return () => clearTimeout(t)
  }, [on, loading])
  return on
}

export function StorySlot({ view, data, ready, waiting, loading, children, ...rest }: StorySlotProps) {
  const switchOn = ready && !waiting && !isShared()
  const shown = switchOn && storyOn(view)
  // The story's own boxes while its first numbers are on their way, never Explore's layout first and the story after it.
  const veiled = !data && loading && !waiting && !isShared() && storyOn(view)
  const switching = useSwitching(`${shown || veiled}|${view.story ?? ''}`, loading) // the story's boxes handing over to the story is no switch
  const cls = ['sleep', 'view-stage', waiting && 'waiting', switching ? 'sv-switching' : 'sv-settled', ready && loading && !switching ? 'pending' : 'settled'].filter(Boolean).join(' ')
  useEffect(() => {
    if (switching) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [switching])
  return (
    <div className={cls} aria-hidden={waiting || undefined} inert={waiting || switching}>
      {switching && (
        <div className="sv-veil">
          <Loading size="block">{slot.preparing}</Loading>
        </div>
      )}
      {switchOn && data && (
        <Suspense fallback={shown ? <StorySkeleton /> : null}>
          <StoryHost {...rest} on={shown} from={view.story} data={data} />
        </Suspense>
      )}
      {veiled && <StorySkeleton />}
      {!shown && !veiled && children}
    </div>
  )
}
