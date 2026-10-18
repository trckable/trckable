// The bell at the end of the header: a dot with how many are unread, and the list under it (a sheet on a phone).
// Markup and classes are the walkthrough's own.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { reducedMotion } from '../../lib/motion'
import { MkPortal } from './Portal'
import { useMenu } from './useMenu'
import { useTopLayerWhen } from '../../lib/topLayer'
import './bellMenu.css'

export interface BellRow {
  id: string
  kind: string
  title: string
  sub: string
  unread: boolean
  dismissable?: boolean
}

const PATH: Record<string, ReactNode> = {
  down: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  up: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  spike: <path d="M4 18l5-6 4 3 7-9" />,
  sale: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.4-2.5 1.6-2.5.7-2.5 1.7 1 1.6 2.5 1.6 2.5-.6 2.5-1.6" />
    </>
  ),
  failed: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5M12 16v.5" />
    </>
  ),
  mention: <path d="M5 6h14v9H10l-4 3v-3H5z" />,
  milestone: <path d="M6 21V4M6 5h11l-2 4 2 4H6" />,
  plan: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M14.5 9.6c0-1-1.1-1.6-2.5-1.6s-2.5.6-2.5 1.6 1.1 1.4 2.5 1.7 2.5.7 2.5 1.7-1.1 1.6-2.5 1.6-2.5-.6-2.5-1.6" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5M16 6a3 3 0 0 1 0 6" />
    </>
  ),
  weekly: <path d="M7 3h7l4 4v14H7z M14 3v4h4" />,
}

/** How long the rows take to settle when a new one arrives on top. */
const SLIDE_MS = 260

/** The box that scrolls the rows: the sheet's body on a phone, the list itself under the bell. */
const scroller = (list: HTMLElement): HTMLElement => list.closest<HTMLElement>('.cdb') ?? list

/** The first row in view, and how far from the top of the box it sits. */
function anchorOf(list: HTMLElement): { id: string; top: number } | null {
  const box = scroller(list).getBoundingClientRect()
  for (const w of list.querySelectorAll<HTMLElement>('.nfw')) {
    const r = w.getBoundingClientRect()
    if (r.bottom > box.top) return { id: w.dataset.id ?? '', top: r.top - box.top }
  }
  return null
}

/**
 * New rows arriving in an open list never move what is being read. Scrolled down, the list is scrolled by what came in
 * above, so the same row stays under the finger. At the top, the rows slide down into place on the compositor (the
 * layout has already moved; the transform puts every old row back where it was drawn, then lets go), and the new ones
 * fade in. With reduced motion there is the fade only.
 */
function useArrival(list: RefObject<HTMLDivElement | null>, fresh: ReadonlySet<string>, rows: readonly BellRow[]) {
  const seen = useRef<{ id: string; top: number; scrolled: number } | null>(null)
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const box = scroller(el)
    const was = seen.current
    const items = [...el.querySelectorAll<HTMLElement>('.nfw')]
    const fresher = items.filter((w) => fresh.has(w.dataset.id ?? ''))
    if (fresher.length && was) {
      if (was.scrolled > 0) {
        const a = items.find((w) => w.dataset.id === was.id)
        if (a) box.scrollTop += a.getBoundingClientRect().top - box.getBoundingClientRect().top - was.top
      } else if (!reducedMotion() && typeof el.animate === 'function') {
        const first = items.find((w) => !fresh.has(w.dataset.id ?? ''))
        const lift = first ? first.offsetTop - items[0].offsetTop : 0
        if (lift > 0) for (const w of items) w.animate([{ transform: `translateY(${-lift}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'cubic-bezier(.2,.7,.2,1)' })
      }
    }
    if (typeof el.animate === 'function') for (const w of fresher) w.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: 'ease-out' })
    const a = anchorOf(el)
    seen.current = a && { ...a, scrolled: box.scrollTop }
  }, [list, fresh, rows])
  // Scrolling by hand moves the mark the next arrival is measured from.
  useEffect(() => {
    const el = list.current
    if (!el) return
    const box = scroller(el)
    const f = () => {
      const a = anchorOf(el)
      seen.current = a && { ...a, scrolled: box.scrollTop }
    }
    box.addEventListener('scroll', f, { passive: true })
    return () => box.removeEventListener('scroll', f)
  }, [list])
}

interface BellProps {
  /** The bell is mid-wiggle for something new (useBellAlert). */
  shaking?: boolean
  /** Told when the list opens or shuts. */
  onOpenChange?: (open: boolean) => void
  /** The bell is about to be opened (hovered, focused, touched): the list can be read now. */
  onWarm?: () => void
  /** The list is not all there yet: one placeholder row stands in for it. */
  loading?: boolean
  /** The rows that arrived while the list was open. */
  fresh?: ReadonlySet<string>
  rows: BellRow[]
  unread: number
  /** The count as the dot says it: "9+" over nine. */
  badge: string
  title: string
  markAll: string
  settings: string
  none: string
  /** A phone shows the list as a sheet over the page, not under the bell. */
  sheet: boolean
  onPick: (id: string) => void
  onAll: () => void
  onSettings: () => void
  /** A build with its own list: a row can be put away, and the archive is a second view. */
  onDismiss?: (id: string) => void
  archive?: { rows: BellRow[]; load: () => void; loading: boolean; words: { dismiss: string; archive: string; fresh: string; none: string } }
}

const EMPTY: ReadonlySet<string> = new Set()

function List(p: BellProps & { close: () => void }) {
  const [old, setOld] = useState(false)
  const rows = old && p.archive ? p.archive.rows : p.rows
  const list = useRef<HTMLDivElement>(null)
  useArrival(list, p.fresh ?? EMPTY, rows)
  return (
    <>
      <div className="nfh">
        <b>{p.title}</b>
        <button type="button" className="lk3" disabled={p.loading || !p.rows.some((r) => r.unread)} onClick={p.onAll}>
          {p.markAll}
        </button>
      </div>
      <div className="nfl" ref={list} aria-busy={p.loading || undefined}>
        {p.loading && !old && (
          <div className="nfs" aria-hidden="true">
            <i />
            <span>
              <b />
              <small />
            </span>
          </div>
        )}
        {rows.length === 0 && !(p.loading && !old) && <div className="xnone">{old && p.archive ? p.archive.words.none : p.none}</div>}
        {!(p.loading && !old) &&
          rows.map((n) => (
          <div key={n.id} className="nfw" data-id={n.id}>
          <button
            type="button"
            className={`nf ${n.unread ? 'unread' : ''}`}
            onClick={() => {
              p.onPick(n.id)
              p.close()
            }}
          >
            <svg className={`nfi k-${n.kind}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {PATH[n.kind] ?? PATH.weekly}
            </svg>
            <span className="nft">
              <b>{n.title}</b>
              <small>{n.sub}</small>
            </span>
            {n.unread && <i className="nfd" />}
          </button>
          {n.dismissable && !old && p.onDismiss && (
            <button type="button" className="nfx" aria-label={p.archive?.words.dismiss} title={p.archive?.words.dismiss} onClick={() => p.onDismiss?.(n.id)}>
              ×
            </button>
          )}
          </div>
        ))}
      </div>
      <div className="nff">
        {p.archive && (
          <button type="button" className="lk3" aria-pressed={old} onClick={() => { if (!old) p.archive?.load(); setOld(!old) }}>
            {old ? p.archive.words.fresh : p.archive.words.archive}
          </button>
        )}
        <button type="button" className="lk3" onClick={() => { p.onSettings(); p.close() }}>
          {p.settings}
        </button>
      </div>
    </>
  )
}

export function BellMenu(p: BellProps) {
  const { open, attach, toggle, close } = useMenu()
  const menu = useRef<HTMLDivElement>(null)
  const { onOpenChange } = p
  useEffect(() => onOpenChange?.(open), [open, onOpenChange])
  useTopLayerWhen(open && !p.sheet, menu)
  return (
    <div className="bellw" ref={attach} style={{ position: 'relative' }}>
      <button type="button" className={`ib bell${p.shaking ? " shake" : ""}`} id="bellBtn" data-bell="1" data-key="notes" title={p.title} aria-label={p.title} aria-haspopup={p.sheet ? "dialog" : "menu"} aria-expanded={open} onClick={toggle} onPointerEnter={p.onWarm} onFocus={p.onWarm} onTouchStart={p.onWarm}>
        <i className="bdot" id="bellDot" style={p.unread ? undefined : { display: 'none' }}>
          {p.badge}
        </i>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M4 7a4 4 0 0 1 8 0v3l1.2 2H2.8L4 10z" />
          <path d="M6.5 14h3" />
        </svg>
      </button>
      {!p.sheet && (
        <div ref={menu} className={`mk-menu bellmenu${open ? ' on' : ''}`} id="bellMenu">
          {open && <List {...p} close={close} />}
        </div>
      )}
      {p.sheet && open && (
        <MkPortal>
          <div className="xscrim on" onClick={close} aria-hidden="true" />
          <aside className="cd on" role="dialog" aria-modal="true" aria-label={p.title} tabIndex={-1}>
            <div className="cdh">
              <b>{p.title}</b>
              <button type="button" className="ib x" title="Close" onClick={close}>
                ×
              </button>
            </div>
            <div className="cdb">
              <List {...p} close={close} />
            </div>
          </aside>
        </MkPortal>
      )}
    </div>
  )
}
