// A shared link's way to read the numbers again without reloading the page: the same "trckable:refresh" the palette's
// Refresh sends, which every report and table on the page answers in place. The icon spins until the report's read ends.
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { sharedReads } from '../../lib/api'
import { copy } from './sharePeriodCopy'

/** The least time the icon spins, so a read answered from memory still shows the click was taken. */
const SPIN = 400
/** A click that starts no read (nothing to read again) stops spinning after this. */
const GIVE_UP = 3000

export function ShareRefresh() {
  const reading = sharedReads.use()
  const [since, setSince] = useState(0) // when the click was taken; 0 = idle
  const began = useRef(false)
  useEffect(() => {
    if (!since) return
    if (reading > 0) {
      began.current = true
      return
    }
    const wait = began.current ? Math.max(0, SPIN - (Date.now() - since)) : GIVE_UP
    const t = window.setTimeout(() => setSince(0), wait)
    return () => window.clearTimeout(t)
  }, [reading, since])
  return (
    <button
      type="button"
      className="xb share-refresh"
      aria-label={copy.refresh}
      title={copy.refresh}
      disabled={since > 0}
      onClick={() => {
        began.current = false
        setSince(Date.now())
        window.dispatchEvent(new Event('trckable:refresh'))
      }}
    >
      {since > 0 ? <span className="btn-spin" aria-hidden="true" /> : <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  )
}
