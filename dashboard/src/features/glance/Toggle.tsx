// The quiet switch between today's charts and Glance: two small icons in the
// control row's slot, dim until hovered or focused. Both are real buttons.
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { copy } from './copy'
import type { Format } from './flag'

const noop = () => () => {}

export function FormatToggle({ format, onPick }: { format: Format; onPick: (f: Format) => void }) {
  const slot = useSyncExternalStore(noop, () => document.getElementById('sv-slot'), () => null)
  const el = (
    <div className="g-fmt" role="group" aria-label={copy.formatLabel}>
      <button type="button" aria-pressed={format === 'charts'} aria-label={copy.charts} title={copy.chartsTip} onClick={() => onPick('charts')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V12M10 20V5M15 20v-9M20 20V8" /></svg>
      </button>
      <button type="button" aria-pressed={format === 'glance'} aria-label={copy.glance} title={copy.glanceTip} onClick={() => onPick('glance')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>
      </button>
    </div>
  )
  return slot ? createPortal(el, slot) : el
}
