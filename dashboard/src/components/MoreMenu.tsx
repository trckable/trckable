// The ⋯ menu at the end of the header's one row. What is used now and then
// lives here, so the row stays quiet: Refresh (the numbers refresh on their
// own), Create, Core/Full, and on a phone the site's settings;
// always Export, Shortcuts, Theme and Your account. Each keeps its key, shown
// beside it.
import { Ellipsis } from 'lucide-react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useOnlyOpen, type MenuItems } from '../lib/headerMenu'
import { lazyLoad, warm, whenIdle } from '../lib/lazyLoad'
import { copy } from './moreCopy'

// The items are their own chunk (MoreItems.tsx), fetched while idle or on the
// way to the button (lib/lazyLoad).
const MoreItems = lazyLoad(() => import('./MoreItems'))

export interface MoreProps {
  full: boolean
  /** Live is on screen: it has no period, so no Refresh, Create or Core/Full. */
  live: boolean
  /** A phone: the site's cog is not in the row either. */
  onSettings?: () => void
  onMode: (m: 'core' | 'full') => void
  onRefresh: () => void
  onExport: () => void
  /** Absent where nothing can be created (a viewer, a shared link). */
  onCreate?: () => void
  /** The milestones timeline; dot: something new in it. Absent while off. */
  milestones?: { open: () => void; dot: boolean }
}

export function MoreMenu(props: MoreProps) {
  useEffect(() => whenIdle(MoreItems.preload), [])
  return <Own {...props} />
}

function Own(props: MoreProps) {
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
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
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

function Items(p: { p: MoreProps; go: Parameters<MenuItems>[0] }) {
  return (
    <Suspense fallback={null}>
      <MoreItems {...p} />
    </Suspense>
  )
}
