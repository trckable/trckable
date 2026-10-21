// The bell at the end of the header: a dot with how many are unread, and the list under it (a sheet on a phone).
// Markup and classes are the walkthrough's own.
import { Check, ListFilter, MoreHorizontal, X } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { reducedMotion } from '../../lib/motion'
import { Popover } from '../../kit/Popover'
import { MkPortal } from './Portal'
import { useMenu } from './useMenu'
import { useTopLayerWhen } from '../../lib/topLayer'
import { BELL_PATH } from './bellIcons'
import { byDay } from '../bell/days'
import { copy } from '../bell/copy'
import './bellMenu.css'

/** What a row's ⋯ offers: mute it for the site, change its alert, put it away. */
export interface RowAction {
  key: 'mute' | 'change' | 'archive'
  label: string
  run: () => void
}

export interface BellRow {
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

/** The ⋯ of a row and what it offers: the kit's popover under the button (a sheet on a phone), over the list, so no row moves. */
function RowMenu({ row, close }: { row: BellRow; close: () => void }) {
  const actions = row.actions ?? []
  if (actions.length === 0) return null
  return (
    <Popover
      label={copy.more}
      className="nfpop"
      trigger={(t) => (
        <button type="button" className="nfx" aria-label={copy.more} title={copy.more} {...t}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}
    >
      {(shut) => (
        <div role="menu">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className="nfpi"
              onClick={() => {
                shut()
                a.run()
                if (a.key === 'change') close()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

function Icon({ kind }: { kind: string }) {
  return (
    <svg className={`nfi k-${kind}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {BELL_PATH[kind] ?? BELL_PATH.weekly}
    </svg>
  )
}

function Row({ n, p, close }: { n: BellRow; p: BellProps; close: () => void }) {
  const pick = (id: string) => {
    p.onPick(id)
    close()
  }
  const under = [n.sub, n.time].filter(Boolean).join(' · ')
  return (
    <div className="nfw" data-id={n.id}>
      {n.lines ? (
        <div className={`nf grp ${n.unread ? 'unread' : ''}`}>
          <Icon kind={n.kind} />
          <span className="nft">
            <b>{n.title}</b>
            {n.lines.map((l) => (
              <button key={l.id} type="button" className="nfn" onClick={() => pick(l.id)}>
                {l.text}
              </button>
            ))}
            {under && <small>{under}</small>}
          </span>
          {n.unread && <i className="nfd" />}
        </div>
      ) : (
        <button type="button" className={`nf ${n.unread ? 'unread' : ''}${n.bad ? ' bad' : ''}`} onClick={() => pick(n.id)}>
          <Icon kind={n.kind} />
          <span className="nft">
            <b>{n.title}</b>
            {under && <small>{under}</small>}
          </span>
          {n.unread && <i className="nfd" />}
        </button>
      )}
      <RowMenu row={n} close={close} />
    </div>
  )
}

/** The one filter button: a quiet icon with a dot while the list is narrowed, and the kit's popover (a sheet on a phone) with the kinds and the sites. */
function FilterMenu({ f }: { f: NonNullable<BellProps['filter']> }) {
  const group = (label: string, items: { id: string; label: string; on: boolean; dot?: boolean; pick: () => void }[], shut: () => void) => (
    <div role="group" aria-label={label} className="nfg">
      <h4>{label}</h4>
      {items.map((o) => (
        <button
          key={o.id}
          type="button"
          role="menuitemradio"
          aria-checked={o.on}
          className="nfpi"
          onClick={() => {
            o.pick()
            shut()
          }}
        >
          <span className="nfpl">{o.label}</span>
          {o.dot && <i className="nfd sm" aria-hidden="true" />}
          {o.on && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
  return (
    <Popover
      label={copy.filter}
      className="nfpop"
      trigger={(t) => (
        <button type="button" className="nfq" aria-label={f.active ? `${copy.filter}: ${f.active}` : copy.filter} title={copy.filter} {...t}>
          <ListFilter size={18} aria-hidden="true" />
          {f.active && <i className="nfd sm" aria-hidden="true" />}
        </button>
      )}
    >
      {(shut) => (
        <div role="menu">
          {group(copy.filterLabel, f.groups.map((g) => ({ id: g.id, label: g.label, on: g.on, dot: g.dot, pick: () => f.onGroup(g.id) })), shut)}
          {f.sites && group(copy.siteLabel, f.sites.map((o) => ({ id: o.value || 'all', label: o.label, on: o.on, pick: () => f.onSite(o.value) })), shut)}
        </div>
      )}
    </Popover>
  )
}

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
        {p.archive && !waiting && (
          <button type="button" className="lk3 nfar" aria-pressed={old} onClick={() => { if (!old) p.archive?.load(); setOld(!old) }}>
            {old ? copy.showNew : copy.showArchived}
          </button>
        )}
      </div>
      <div className="nff">
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
