// Live | Data: which of the two the dashboard shows. A pill glides under the
// chosen one (styles.css, .view-switch); L flips it from anywhere but a
// text field. It stays tiny: it loads with the dashboard, Live itself does not,
// but pointing at the switch or focusing it starts fetching Live's code.
import { useEffect } from 'react'
import { caps, keyFor, pressed, useKeymap } from '../../lib/keys'
import { entryCopy as copy } from './entryCopy'
import { preloadLive } from './liveChunk'
import { switchView } from './switchView'

// A failed fetch is not an error here: the click tries again and Live says so.
const warm = () => void preloadLive().catch(() => undefined)

export function ViewSwitch({ live }: { live: boolean }) {
  useKeymap()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pressed(e, 'live') || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      void switchView(!live)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live])
  const key = caps(keyFor('live')).join('')
  return (
    <div className={live ? 'view-switch live' : 'view-switch'} role="group" aria-label={copy.switchLabel} title={copy.switchTitle(key)} onPointerEnter={warm} onFocus={warm}>
      <span className="view-pill" aria-hidden="true" />
      <button type="button" aria-pressed={live} aria-keyshortcuts={key} onClick={() => void switchView(true)}>
        <span className="pulse" aria-hidden="true" />
        {copy.live}
      </button>
      <button type="button" aria-pressed={!live} onClick={() => void switchView(false)}>
        {copy.data}
      </button>
    </div>
  )
}
