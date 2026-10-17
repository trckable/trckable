// Moving between Live, the Briefing and Data, deliberately: Live is one screen,
// so it opens at the top, and so does the Briefing (as the walkthrough's does); Data comes back scrolled to where it was left.
import { rememberTab, type Tab } from '../../lib/tab'
import { readView, setView } from '../../lib/url'
import { transition } from '../../lib/viewTransition'
import { minuteView } from './minute'

// How long a restored scroll place is held while the page fills in.
const SETTLE_MS = 1500

let dataScroll = 0

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
  if (from === 'data') dataScroll = scrollY
  const top = to === 'data' ? dataScroll : 0
  await transition(
    () => setView(patchFor(to)),
    () => keepScroll(top),
  )
}

// Data's charts and lists fill in after the switch, so the page can still be a
// few pixels short when the old place is restored and the browser clamps the
// scroll to it (WebKit moves scrollY itself while the page shrinks, so a changed
// scrollY is no sign of the reader). While the page settles, put it back, until
// the reader scrolls, presses a key or touches the page.
const READER = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const

function keepScroll(top: number) {
  window.scrollTo(0, top)
  if (!top || !window.ResizeObserver) return
  const stop = () => {
    ro.disconnect()
    clearTimeout(timer)
    for (const e of READER) window.removeEventListener(e, stop)
  }
  const ro = new ResizeObserver(() => scrollTo(0, top))
  const timer = setTimeout(stop, SETTLE_MS)
  ro.observe(document.body)
  for (const e of READER) window.addEventListener(e, stop, { passive: true })
}

/** A minute on Live's line, opened in Data: that minute's day (Now when it is today), from the top. */
export async function openMinute(ago: number, tz: string): Promise<void> {
  const patch = minuteView(ago, tz)
  await transition(
    () => setView(patch),
    () => window.scrollTo(0, 0),
  )
}
