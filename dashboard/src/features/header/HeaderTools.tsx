// The tools of the old Data view's header row, after the site: Live/Data (on a desktop) and the borderless Ask.
// What the numbers are, Live/Data on a phone or tablet, the period and the page's ⋯ (Refresh,
// Create, Core/Full, Milestones, Export), is the row under it.
import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { caps, keyFor, useKeymap } from '../../lib/keys'
import { isShared } from '../../lib/me'
import { can } from '../../lib/permissions'
import { ViewSwitch } from '../live/ViewSwitch'
import { copy } from './copy'
import { useWide } from './useWide'
import './Header.css'

interface Props {
  live: boolean
  briefing?: boolean
  askOpen: boolean
  onAsk: () => void
  extra?: ReactNode
  /** Before the first visit there is nothing to ask about. */
  waiting?: boolean
}

export function HeaderTools(p: Props) {
  useKeymap()
  const shared = isShared()
  // A desktop has the switch here, before what the page puts in this group;
  // anywhere narrower it stays in the row under the header.
  const wide = useWide()
  const askKey = caps(keyFor('ask')).join('')
  return (
    <div className="header-tools quiet">
      <div className="spacer" />
      {wide && !shared && !p.waiting && <ViewSwitch live={p.live} briefing={p.briefing} />}
      {p.extra}
      {can('peek.ask') && !p.waiting && (
        <button type="button" className="btn ghost ask" onClick={p.onAsk} aria-expanded={p.askOpen} aria-label={copy.ask} title={copy.askTitle(askKey)}>
          <Search size={17} strokeWidth={1.75} aria-hidden="true" />
          <span className="ask-label">{copy.ask}</span>
          <span className="kbd">{askKey}</span>
        </button>
      )}
    </div>
  )
}

// The header's other control, next to the site's name; it is placed with the tools.
export { DomainSwitchHost as DomainSwitch } from './DomainSwitchHost'
