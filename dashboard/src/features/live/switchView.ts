// Moving between Live and Data, deliberately: Live is one screen, so it opens
// at the top; Data comes back scrolled to where it was left. Live's code is
// awaited (briefly) before the switch, so the change is one frame to the next
// with nothing blank in between.
import { setView } from '../../lib/url'
import { transition } from '../../lib/viewTransition'
import { preloadLive } from './liveChunk'
import { minuteView } from './minute'

// Long enough for a chunk on a slow line; past it the switch goes ahead and
// Live shows its placeholder rather than making the click feel ignored.
const WAIT_MS = 400

let dataScroll = 0

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function switchView(live: boolean, now: boolean): Promise<void> {
  if (now === live) return
  if (live) {
    dataScroll = scrollY
    await Promise.race([preloadLive().catch(() => undefined), pause(WAIT_MS)])
  }
  const top = live ? 0 : dataScroll
  await transition(
    () => setView({ live }),
    () => window.scrollTo(0, top),
  )
}

export async function openMinute(ago: number, tz: string): Promise<void> {
  const patch = minuteView(ago, tz)
  await transition(
    () => setView(patch),
    () => window.scrollTo(0, 0),
  )
}
