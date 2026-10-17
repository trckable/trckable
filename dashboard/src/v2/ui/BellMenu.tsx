// The bell at the end of the header: a dot with how many are unread, and the list under it (a sheet on a phone).
// Markup and classes are the walkthrough's own.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MkPortal } from './Portal'
import { useMenu } from './useMenu'
import { useTopLayerWhen } from '../../lib/topLayer'

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

interface BellProps {
  /** The bell is mid-wiggle for something new (useBellAlert). */
  shaking?: boolean
  /** Told when the list opens or shuts. */
  onOpenChange?: (open: boolean) => void
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

function List(p: BellProps & { close: () => void }) {
  const [old, setOld] = useState(false)
  const rows = old && p.archive ? p.archive.rows : p.rows
  return (
    <>
      <div className="nfh">
        <b>{p.title}</b>
        <button type="button" className="lk3" onClick={p.onAll}>
          {p.markAll}
        </button>
      </div>
      <div className="nfl">
        {rows.length === 0 && <div className="xnone">{old && p.archive ? p.archive.words.none : p.none}</div>}
        {rows.map((n) => (
          <div key={n.id} className="nfw">
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
      <button type="button" className={`ib bell${p.shaking ? " shake" : ""}`} id="bellBtn" data-bell="1" data-key="notes" title={p.title} aria-label={p.title} aria-haspopup={p.sheet ? "dialog" : "menu"} aria-expanded={open} onClick={toggle}>
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
