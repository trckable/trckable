// Moving between Live, the Briefing and Data, deliberately: Live is one screen,
// so it opens at the top; the others come back scrolled to where they were left. Live's code is
// awaited (briefly) before the switch, so the change is one frame to the next
// with nothing blank in between.
import { rememberTab, type Tab } from '../../lib/tab'
import { readView, setView } from '../../lib/url'
import { transition } from '../../lib/viewTransition'
import { preloadLive } from './liveChunk'
import { minuteView } from './minute'

// Long enough for a chunk on a slow line; past it the switch goes ahead and
// Live shows its placeholder rather than making the click feel ignored.
const WAIT_MS = 400
// How long a restored scroll place is held while the page fills in.
const SETTLE_MS = 1500

let dataScroll = 0

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function switchView(live: boolean, now: boolean): Promise<void> {
  if (now === live) return
  return switchTab(live ? 'live' : 'data', live ? 'data' : 'live')
}

/** What the address says for each tab. The Briefing is told by the day, so a bare 30 days becomes today. */
function patchFor(to: Tab): Parameters<typeof setView>[0] {
  if (to === 'live') return { live: true }
  if (to === 'data') return { live: false }
  const cur = readView(new URLSearchParams(location.search))
  return { live: false, briefing: true, ...(cur.period === '30d' && !cur.from ? { period: 'today' } : {}) }
}

export async function switchTab(to: Tab, from: Tab): Promise<void> {
  if (to === from) return
  rememberTab(to)
  if (to === 'live') {
    dataScroll = scrollY
    await Promise.race([preloadLive().catch(() => undefined), pause(WAIT_MS)])
  }
  const top = to === 'live' ? 0 : dataScroll
  await transition(
    () => setView(patchFor(to)),
    () => keepScroll(top),
  )
}

// Data's charts and lists fill in after the switch, so the page can still be a
// few pixels short when the old place is restored and the browser clamps the
// scroll to it. While the page settles, put it back (unless the reader moved).
function keepScroll(top: number) {
  window.scrollTo(0, top)
  if (!top || !window.ResizeObserver) return
  let mine = scrollY
  const ro = new ResizeObserver(() => {
    if (scrollY !== mine) return ro.disconnect()
    scrollTo(0, top)
    mine = scrollY
  })
  ro.observe(document.body)
  setTimeout(() => ro.disconnect(), SETTLE_MS)
}

export async function openMinute(ago: number, tz: string): Promise<void> {
  const patch = minuteView(ago, tz)
  await transition(
    () => setView(patch),
    () => window.scrollTo(0, 0),
  )
}
