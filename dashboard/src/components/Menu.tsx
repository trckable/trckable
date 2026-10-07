// The ⋯ menu used wherever a row has more than one action. It is a kit
// Popover: it renders into the page body (so a dialog or a scrolling card can
// never clip it), places itself, closes on Escape, a click outside or the page
// moving, moves between items with the arrows, and is a bottom sheet on a phone.
import { Ellipsis } from 'lucide-react'
import type { ReactNode } from 'react'
import { Popover } from '../kit'
import './sheet.css'

export function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  return (
    <Popover
      label={label}
      className="menu"
      trigger={(p) => (
        <button type="button" className="btn icon ghost" {...p} aria-haspopup="menu" aria-label={label}>
          <Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    >
      {/* Back on the button before what an item opens takes over, so a dialog gives focus back here. */}
      {(close) => (
        <div className="menu-list" role="menu" aria-label={label}>
          {children(close)}
        </div>
      )}
    </Popover>
  )
}
