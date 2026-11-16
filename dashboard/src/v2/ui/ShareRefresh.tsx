// A shared link's way to read the numbers again without reloading the page: the same "trckable:refresh" the palette's
// Refresh sends, which every report and table on the page answers in place.
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { copy } from './sharePeriodCopy'

/** The least time the icon spins: the reads answer from a cache or the network, and a click should show it was taken. */
const SPIN = 700

export function ShareRefresh() {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!busy) return
    const t = window.setTimeout(() => setBusy(false), SPIN)
    return () => window.clearTimeout(t)
  }, [busy])
  return (
    <button
      type="button"
      className="xb share-refresh"
      aria-label={copy.refresh}
      title={copy.refresh}
      disabled={busy}
      onClick={() => {
        setBusy(true)
        window.dispatchEvent(new Event('trckable:refresh'))
      }}
    >
      {busy ? <span className="btn-spin" aria-hidden="true" /> : <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  )
}
