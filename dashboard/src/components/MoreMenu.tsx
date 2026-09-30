// The ⋯ menu next to the period: what belongs to the page on screen. Refresh
// (the numbers refresh on their own), Create, Core/Full, Milestones and Export.
// Each keeps its key, shown beside it.
// What belongs to the person (Profile, theme, shortcuts, sign out) is the
// avatar's menu (AccountMenu).
import { Ellipsis } from 'lucide-react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useMenuNav, useOnlyOpen, type MenuItems } from '../lib/headerMenu'
import { lazyLoad, warm, whenIdle } from '../lib/lazyLoad'
import { openCreate, useCreateAvailable } from '../features/create/openCreate'
import { copy } from './moreCopy'

// The items are their own chunk (MoreItems.tsx), fetched while idle or on the
// way to the button (lib/lazyLoad).
const MoreItems = lazyLoad(() => import('./MoreItems'))

export interface MoreProps {
  full: boolean
  onMode: (m: 'core' | 'full') => void
  onRefresh: () => void
  /** A phone: Share is the menu's first item, not a button in the row. */
  onShare?: () => void
  /** A phone, with saved views: an item that opens their list. */
  onViews?: () => void
  onExport: () => void
  /** The milestones timeline; dot: something new in it. Absent while off. */
  milestones?: { open: () => void; dot: boolean }
}

export function MoreMenu(props: MoreProps) {
  useEffect(() => whenIdle(MoreItems.preload), [])
  // CreateMenu says whether it has anything to offer (owner, not shared, a module on).
  const canCreate = useCreateAvailable()
  return <Own {...props} onCreate={canCreate ? openCreate : undefined} />
}

function Own(props: MoreProps & { onCreate?: () => void }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useOnlyOpen('more', open, close)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  useMenuNav(open, root, button, close)
  // Focus goes back to ⋯ before the choice runs, so a menu or dialog that it
  // opens hands focus back there when it closes.
  const go = (fn: () => void) => () => {
    setOpen(false)
    button.current?.focus()
    fn()
  }
  return (
    <div ref={root} className="more">
      <button ref={button} type="button" className="btn icon ghost more-btn" aria-haspopup="menu" aria-expanded={open} aria-label={copy.more} title={copy.more} {...warm(MoreItems.preload)} onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
        {props.milestones?.dot && <span className="more-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="pop menu more-menu" role="menu" aria-label={copy.more}>
          <Items p={props} go={go} />
        </div>
      )}
    </div>
  )
}

function Items(p: { p: MoreProps & { onCreate?: () => void }; go: Parameters<MenuItems>[0] }) {
  return (
    <Suspense fallback={null}>
      <MoreItems {...p} />
    </Suspense>
  )
}
