// Live | Briefing | Data: which of the three the dashboard shows. On a phone it is the
// bar at the bottom of the screen (the thumb's), elsewhere a segmented control. A pill glides under the
// chosen one (styles.css, .view-switch); L flips it from anywhere but a
// text field. It stays tiny: it loads with the dashboard, Live itself does not,
// but pointing at the switch or focusing it starts fetching Live's code.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { caps, keyFor, pressed, useKeymap } from '../../lib/keys'
import { wantsBriefing, type Tab } from '../../lib/tab'
import { useNarrow } from '../../lib/useNarrow'
import { entryCopy as copy } from './entryCopy'
import { liveCount, liveLink, siteDown } from './liveLink'
import { preloadLive } from './liveChunk'
import { navigate, readView, writeView } from '../../lib/url'
import { switchTab } from './switchView'

// A failed fetch is not an error here: the click tries again and Live says so.
const warm = () => void preloadLive().catch(() => undefined)

function tabOf(live: boolean, briefing: boolean): Tab {
  if (live) return 'live'
  return briefing ? 'briefing' : 'data'
}

/** Where L goes from Live: back to the tab that was left, the Briefing or Data. */
const away = (): Tab => (wantsBriefing() ? 'briefing' : 'data')

export function ViewSwitch({ live, briefing = false }: { live: boolean; briefing?: boolean }) {
  useKeymap()
  const phone = useNarrow()
  const now = tabOf(live, briefing)
  const go = (to: Tab) => void switchTab(to, now)
  // A bare address opens where the person left off: the Briefing, when that was it.
  useEffect(() => {
    const v = readView(new URLSearchParams(location.search))
    if (!live && !briefing && writeView(v) === '' && wantsBriefing()) navigate(location.pathname + writeView({ ...v, live: false, briefing: true, period: 'today' }), { replace: true })
  }, [live, briefing])
  const linked = liveLink.use()
  const online = liveCount.use()
  const down = siteDown.use()
  const n = online && online > 0 ? online : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pressed(e, 'live') || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      void switchTab(live ? away() : 'live', now)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, now])
  const key = caps(keyFor('live')).join('')
  // While Live is on and its connection is down, the dot dims.
  const classes = ['view-switch', phone && 'bottom']
  if (live) classes.push('live')
  if (live && !linked) classes.push('lost')
  if (down) classes.push('down')
  const bar = (
    <div className={classes.filter(Boolean).join(' ')} role="group" aria-label={copy.switchLabel} title={copy.switchTitle(key)} onPointerEnter={warm} onFocus={warm}>
      <span className="view-pill" aria-hidden="true" />
      <button type="button" aria-pressed={live} aria-keyshortcuts={key} aria-label={n ? copy.liveOnline(n) : undefined} onClick={() => go('live')}>
        <span className="pulse" aria-hidden="true" />
        {copy.live}
        {n && <span className="vs-count" aria-hidden="true"> · {n.toLocaleString()}</span>}
      </button>
      <button type="button" aria-pressed={briefing} onClick={() => go('briefing')}>
        {copy.briefing}
      </button>
      <button type="button" aria-pressed={!live && !briefing} onClick={() => go('data')}>
        {copy.data}
      </button>
    </div>
  )
  return phone ? createPortal(bar, document.querySelector('.app') ?? document.body) : bar
}
