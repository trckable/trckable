// Live | Data: which of the two the dashboard shows. A pill glides under the
// chosen one (styles.css, .view-switch); L flips it from anywhere but a
// text field. It stays tiny: it loads with the dashboard, Live itself does not,
// but pointing at the switch or focusing it starts fetching Live's code.
import { useEffect } from 'react'
import { caps, keyFor, pressed, useKeymap } from '../../lib/keys'
import { entryCopy as copy } from './entryCopy'
import { liveCount, liveLink } from './liveLink'
import { preloadLive } from './liveChunk'
import { switchView } from './switchView'

// A failed fetch is not an error here: the click tries again and Live says so.
const warm = () => void preloadLive().catch(() => undefined)

export function ViewSwitch({ live }: { live: boolean }) {
  useKeymap()
  const linked = liveLink.use()
  const online = liveCount.use()
  const n = online && online > 0 ? online : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pressed(e, 'live') || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      void switchView(!live, live)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live])
  const key = caps(keyFor('live')).join('')
  // While Live is on and its connection is down, the dot dims.
  const classes = ['view-switch']
  if (live) classes.push('live')
  if (live && !linked) classes.push('lost')
  return (
    <div className={classes.join(' ')} role="group" aria-label={copy.switchLabel} title={copy.switchTitle(key)} onPointerEnter={warm} onFocus={warm}>
      <span className="view-pill" aria-hidden="true" />
      <button type="button" aria-pressed={live} aria-keyshortcuts={key} aria-label={n ? copy.liveOnline(n) : undefined} onClick={() => void switchView(true, live)}>
        <span className="pulse" aria-hidden="true" />
        {copy.live}
        {n && <span className="vs-count" aria-hidden="true"> · {n.toLocaleString()}</span>}
      </button>
      <button type="button" aria-pressed={!live} onClick={() => void switchView(false, live)}>
        {copy.data}
      </button>
    </div>
  )
}
