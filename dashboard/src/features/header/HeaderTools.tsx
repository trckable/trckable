// The header's first row, after the site: borderless Ask and Filter, Share
// as the only filled button, and ⋯. Refresh, Create and Core/Full live in ⋯ with their keys.
// What the numbers are, Live/Data and the period, is the row under it.
import { Search, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { MoreMenu } from '../../components/MoreMenu'
import { caps, keyFor, useKeymap } from '../../lib/keys'
import { isShared } from '../../lib/me'
import { openCreate, useCreateAvailable } from '../create/openCreate'
import { copy } from './copy'
import './Header.css'

interface Props {
  live: boolean
  full: boolean
  /** On a phone the site's cog moves into ⋯ too. */
  onSettings?: () => void
  askOpen: boolean
  onAsk: () => void
  onShare: () => void
  onMode: (m: 'core' | 'full') => void
  onRefresh: () => void
  onExport: () => void
  /** Filter and anything passing (the channel being followed). */
  filter?: ReactNode
  extra?: ReactNode
  /** Before the first visit there is nothing to ask about, filter or share. */
  waiting?: boolean
  milestones?: { open: () => void; dot: boolean }
}

export function HeaderTools(p: Props) {
  useKeymap()
  const shared = isShared()
  // CreateMenu says whether it has anything to offer (owner, not shared, a module on).
  const canCreate = useCreateAvailable()
  const askKey = caps(keyFor('ask')).join('')
  return (
    <div className="header-tools quiet">
      <div className="spacer" />
      {p.extra}
      {!shared && !p.waiting && (
        <button type="button" className="btn ghost ask" onClick={p.onAsk} aria-expanded={p.askOpen} aria-label={copy.askLabel} title={copy.askTitle(askKey)}>
          <Search size={17} strokeWidth={1.75} aria-hidden="true" />
          <span className="ask-label">{copy.ask}</span>
          <span className="kbd">{askKey}</span>
        </button>
      )}
      {!p.waiting && p.filter}
      {!shared && !p.live && !p.waiting && (
        <button type="button" className="btn primary share-btn" onClick={p.onShare} title={copy.shareTitle}>
          <Share2 size={16} strokeWidth={1.9} aria-hidden="true" />
          <span className="label">{copy.share}</span>
        </button>
      )}
      <MoreMenu
        full={p.full}
        live={p.live}
        onSettings={p.onSettings}
        onMode={p.onMode}
        onRefresh={p.onRefresh}
        onExport={p.onExport}
        onCreate={canCreate ? openCreate : undefined}
        milestones={p.milestones}
      />
    </div>
  )
}
