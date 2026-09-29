// The ⋯ menu's items (MoreMenu.tsx). Its own chunk, so the first load carries only the button.
import { Bookmark, Cog, Download, Flag, Maximize2, Minimize2, Plus, RefreshCw, Share2 } from 'lucide-react'
import type { MenuItems } from '../lib/headerMenu'
import { caps, keyFor } from '../lib/keys'
import { isShared } from '../lib/me'
import type { MoreProps } from './MoreMenu'
import { copy } from './moreCopy'
import './MoreItems.css'

/** An item's key, as the shortcuts list shows it. */
function Kbd({ id }: { id: string }) {
  return <kbd className="menu-kbd">{caps(keyFor(id)).join('')}</kbd>
}

/** The items of the ⋯ menu. */
export default function MoreItems({ p, go }: { p: MoreProps & { onCreate?: () => void }; go: Parameters<MenuItems>[0] }) {
  return (
    <>
      {p.onShare && (
        <button type="button" role="menuitem" onClick={go(p.onShare)}>
          <Share2 size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.share}
        </button>
      )}
      {p.onViews && (
        <button type="button" role="menuitem" onClick={go(p.onViews)}>
          <Bookmark size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.views}
        </button>
      )}
      <button type="button" role="menuitem" onClick={go(p.onRefresh)}>
        <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
        {copy.refresh}
      </button>
      {p.onCreate && (
        <button type="button" role="menuitem" onClick={go(p.onCreate)}>
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.create}
          <Kbd id="create" />
        </button>
      )}
      <ModeItem full={p.full} go={go(() => p.onMode(p.full ? 'core' : 'full'))} />
      {p.onSettings && (
        <button type="button" role="menuitem" onClick={go(p.onSettings)}>
          <Cog size={18} strokeWidth={1.75} aria-hidden="true" />
          {copy.settings}
        </button>
      )}
      {!isShared() && (
        <>
          {p.milestones && (
            <button type="button" role="menuitem" onClick={go(p.milestones.open)} aria-label={p.milestones.dot ? copy.milestonesNew : copy.milestones}>
              <Flag size={18} strokeWidth={1.75} aria-hidden="true" />
              {copy.milestones}
              {p.milestones.dot && <span className="more-dot" aria-hidden="true" />}
            </button>
          )}
          <button type="button" role="menuitem" onClick={go(p.onExport)}>
            <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            {copy.export}
          </button>
        </>
      )}
    </>
  )
}

function ModeItem({ full, go }: { full: boolean; go: () => void }) {
  const Icon = full ? Minimize2 : Maximize2
  return (
    <button type="button" role="menuitem" onClick={go}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      {full ? copy.core : copy.full}
      <Kbd id="mode" />
    </button>
  )
}
