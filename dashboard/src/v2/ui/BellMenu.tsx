// The bell at the end of the header: a dot with how many are unread, and the list under it (a sheet on a phone).
// Markup and classes are the walkthrough's own.
import { X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { MkPortal } from './Portal'
import { useMenu } from './useMenu'
import { useTopLayerWhen } from '../../lib/topLayer'
import { byDay } from '../bell/days'
import { copy } from '../bell/copy'
import { useArrival } from './useBellArrival'
import { FilterMenu } from './BellPopovers'
import { Row } from './BellItem'
import './bellMenu.css'

/** What a row's ⋯ offers: mute it for the site, change its alert, put it away. */
export interface RowAction {
  key: 'mute' | 'change' | 'archive'
  label: string
  run: () => void
}

export interface BellRow {
  /** The host that sent it: its own mark is the icon. */
  source?: string
  /** The whole row said out loud (title, details, source). */
  label?: string
  id: string
  kind: string
  /** Unix seconds: the day it is listed under. */
  at: number
  title: string
  /** What else is said under the title. */
  sub: string
  /** The row's time ('' for none). */
  time: string
  unread: boolean
  /** Still going: drawn red. */
  bad?: boolean
  /** Several in one row: each listed under the title, and opens on its own. */
  lines?: { id: string; text: string }[]
  actions?: RowAction[]
}

export interface BellProps {
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
  /** The kinds the list can be narrowed to, and (with several sites) the site; a dot says there is something unread under it. */
  filter?: {
    groups: { id: string; label: string; on: boolean; dot: boolean }[]
    onGroup: (id: string) => void
    sites?: { value: string; label: string; on: boolean }[]
    onSite: (site: string) => void
    /** The choice in words ("Down · history.example"); '' when the list is not narrowed. */
    active: string
    onClear: () => void
  }
  /** A build with its own list: the archive is a second view of it. */
  archive?: { rows: BellRow[]; load: () => void; loading: boolean; none: string }
}

const EMPTY: ReadonlySet<string> = new Set()

/** What sits in the panel's header row: the filter and Mark all read. */
function Tools(p: BellProps) {
  return (
    <span className="nftools">
      {p.filter && <FilterMenu f={p.filter} />}
      <button type="button" className="lk3" disabled={p.loading || !p.rows.some((r) => r.unread)} onClick={p.onAll}>
        {p.markAll}
      </button>
    </span>
  )
}

function List(p: BellProps & { close: () => void; bare?: boolean }) {
  const [old, setOld] = useState(false)
  const rows = old && p.archive ? p.archive.rows : p.rows
  const list = useRef<HTMLDivElement>(null)
  useArrival(list, p.fresh ?? EMPTY, rows)
  const waiting = p.loading && !old
  return (
    <>
      {!p.bare && (
        <div className="nfh">
          <b>{p.title}</b>
          <Tools {...p} />
        </div>
      )}
      {p.filter?.active && !old && (
        <div className="nfact">
          <span>{p.filter.active}</span>
          <button type="button" className="nfq sm" aria-label={copy.clearFilter} title={copy.clearFilter} onClick={p.filter.onClear}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="nfl" ref={list} aria-busy={p.loading || undefined}>
        {waiting && (
          <div className="nfs" aria-hidden="true">
            <i />
            <span>
              <b />
              <small />
            </span>
          </div>
        )}
        {rows.length === 0 && !waiting && <div className="xnone">{old && p.archive ? p.archive.none : p.none}</div>}
        {!waiting &&
          byDay(rows).map((d) => (
            <Fragment key={d.day}>
              <h3 className="nfdy">{d.label}</h3>
              {d.rows.map((n) => (
                <Row key={n.id} n={n} p={p} close={p.close} />
              ))}
            </Fragment>
          ))}
      </div>
      <div className="nff">
        {p.archive && !waiting ? (
          <button type="button" className="lk3" aria-pressed={old} onClick={() => { if (!old) p.archive?.load(); setOld(!old) }}>
            {old ? copy.showNew : copy.showArchived}
          </button>
        ) : (
          <span />
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
          <aside className="cd on nfsheet" role="dialog" aria-modal="true" aria-label={p.title} tabIndex={-1}>
            <div className="cdh">
              <b>{p.title}</b>
              <Tools {...p} />
              <button type="button" className="nfq" aria-label={copy.close} title={copy.close} onClick={close}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="cdb">
              <List {...p} close={close} bare />
            </div>
          </aside>
        </MkPortal>
      )}
    </div>
  )
}
