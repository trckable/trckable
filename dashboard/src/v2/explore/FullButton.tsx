// The button in the panel's header that makes it full width, or brings it back to a side panel.
import { copy } from './copy'

const EXPAND = 'M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9'
const SHRINK = 'M13 6.5h-3.5v-3.5M3 9.5h3.5v3.5M9.5 6.5 14 2M6.5 9.5 2 14'

export function FullButton({ full, onClick }: { full: boolean; onClick: () => void }) {
  const word = full ? copy.side : copy.full
  return (
    <button type="button" className="ib xfull" id="xpFull" title={word} aria-label={word} aria-pressed={full} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={full ? SHRINK : EXPAND} />
      </svg>
    </button>
  )
}
