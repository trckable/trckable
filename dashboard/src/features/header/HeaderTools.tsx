// The header's first row, after the site: borderless Ask and Filter, the avatar's menu (the person's own things).
// What the numbers are, Live/Data, the period and the page's ⋯ (Refresh,
// Create, Core/Full, Milestones, Export), is the row under it, and so is
// Share: an icon beside ⋯ (on a phone it is ⋯'s first item).
import { Search, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { AccountMenu } from '../../components/AccountMenu'
import { caps, keyFor, useKeymap } from '../../lib/keys'
import { canAsk, isShared } from '../../lib/me'
import { copy } from './copy'
import './Header.css'

interface Props {
  live: boolean
  askOpen: boolean
  onAsk: () => void
  extra?: ReactNode
  /** Before the first visit there is nothing to ask about. */
  waiting?: boolean
}

export function HeaderTools(p: Props) {
  useKeymap()
  const shared = isShared()
  const askKey = caps(keyFor('ask')).join('')
  return (
    <div className="header-tools quiet">
      <div className="spacer" />
      {p.extra}
      {canAsk() && !p.waiting && (
        <button type="button" className="btn ghost ask" onClick={p.onAsk} aria-expanded={p.askOpen} aria-label={copy.ask} title={copy.askTitle(askKey)}>
          <Search size={17} strokeWidth={1.75} aria-hidden="true" />
          <span className="ask-label">{copy.ask}</span>
          <span className="kbd">{askKey}</span>
        </button>
      )}
      {!shared && <AccountMenu />}
    </div>
  )
}

export function ShareButton({ onShare }: { onShare: () => void }) {
  return (
    <button type="button" className="btn icon ghost share-btn" onClick={onShare} title={copy.shareTitle} aria-label={copy.share}>
      <Share2 size={17} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
