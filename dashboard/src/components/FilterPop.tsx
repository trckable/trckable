// The Filter menu itself, loaded the first time the button is pressed
// (FilterMenu.tsx). A Filter button is for the times you know what you are looking for but it is
// not on the page. Clicking a row is still the fast way in; this is the way
// in when the row you want is the four hundredth.
//
// Values come from the report that is already loaded, so opening this costs
// nothing and asks the server nothing. One search box looks through every
// dimension at once ("germany" finds Country: Germany); a dimension the current
// report does not carry — regions and cities in Core — is listed once, at the
// bottom, rather than as a column of greyed-out rows.
import {
  AppWindow,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  FolderTree,
  Globe,
  Languages,
  Link,
  LogIn,
  LogOut,
  Map as MapIcon,
  Megaphone,
  MonitorSmartphone,
  Radio,
  Search,
  Tag,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Row } from '../lib/api'
import { usePhoneLock } from './lockScroll'

export type FilterGroup = {
  name: string
  dims: { dim: string; label: string; icon: LucideIcon; note?: string }[]
}

// Grouped the way somebody thinks about a visit: where they came from, what
// they read, who they are, what they did.
export const FILTER_GROUPS: FilterGroup[] = [
  {
    name: 'Acquisition',
    dims: [
      { dim: 'channel', label: 'Channel', icon: Radio },
      { dim: 'referrer', label: 'Referrer', icon: Link },
      { dim: 'campaign', label: 'Campaign', icon: Megaphone },
      { dim: 'source', label: 'utm_source', icon: Tag, note: 'Full mode' },
      { dim: 'medium', label: 'utm_medium', icon: Tag, note: 'Full mode' },
    ],
  },
  {
    name: 'Content',
    dims: [
      { dim: 'entry_page', label: 'Entry page', icon: LogIn },
      { dim: 'page', label: 'Page', icon: FileText },
      { dim: 'exit_page', label: 'Exit page', icon: LogOut, note: 'Full mode' },
      { dim: 'group', label: 'Section', icon: FolderTree, note: 'None yet' },
    ],
  },
  {
    name: 'Location',
    dims: [
      { dim: 'country', label: 'Country', icon: Globe },
      { dim: 'region', label: 'Region', icon: MapIcon, note: 'Full mode' },
      { dim: 'city', label: 'City', icon: Building2, note: 'Full mode' },
    ],
  },
  {
    name: 'Device',
    dims: [
      { dim: 'device', label: 'Device', icon: MonitorSmartphone },
      { dim: 'browser', label: 'Browser', icon: AppWindow },
      { dim: 'os', label: 'OS', icon: Cpu },
      { dim: 'language', label: 'Language', icon: Languages, note: 'Full mode' },
    ],
  },
  { name: 'Behaviour', dims: [{ dim: 'goal', label: 'Goal', icon: Target, note: 'None yet' }] },
]

const ALL = FILTER_GROUPS.flatMap((g) => g.dims)

export default function FilterPop({
  rows,
  labelFor,
  active,
  onPick,
  onClear,
  root,
  onClose,
}: {
  /** The rows already on the page for one dimension. */
  rows: (dim: string) => Row[]
  /** How a value is written for a person: a country code is not a country. */
  labelFor: (dim: string, value: string) => string
  active: { dim: string; value: string }[]
  onPick: (dim: string, value: string) => void
  onClear: () => void
  /** The button and the menu together: a click outside both closes it. */
  root: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const open = true
  usePhoneLock()
  const [dim, setDim] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape steps back one level before it closes the whole thing.
      if (dim) setDim(null)
      else close()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open, dim])

  useEffect(() => {
    if (open) search.current?.focus()
    setQ('')
  }, [dim, open])

  const close = onClose

  const needle = q.trim().toLowerCase()
  const valuesOf = (d: string) =>
    rows(d)
      .map((r) => ({ dim: d, value: r.value, label: labelFor(d, r.value), visitors: r.visitors }))
      .filter((v) => !needle || v.label.toLowerCase().includes(needle) || v.value.toLowerCase().includes(needle))

  // One dimension picked: its values. Nothing picked but a search typed: the
  // matching values across every dimension, best first.
  const values = useMemo(() => {
    if (dim) return valuesOf(dim).slice(0, 60)
    if (!needle) return []
    return ALL.flatMap((d) => valuesOf(d.dim))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, needle, rows, labelFor])

  const count = (d: string) => rows(d).length
  const picked = (d: string) => active.some((f) => f.dim === d)
  const label = dim ? ALL.find((d) => d.dim === dim) : null
  const top = Math.max(1, ...values.map((v) => v.visitors))
  const pick = (d: string, v: string) => (onPick(d, v), close())

  return (
        <div className="pop menu-pop filter-pop" role="menu">
          <div className="menu-pop-head">
            {dim && label ? (
              <>
                <button type="button" className="menu-back" onClick={() => setDim(null)} aria-label="Back to every dimension">
                  <ChevronLeft size={16} strokeWidth={1.75} />
                </button>
                <b>{label.label}</b>
                <span className="faint">{count(dim)} values</span>
              </>
            ) : (
              <>
                <b>Filter</b>
                <span className="faint">every number on the page</span>
              </>
            )}
          </div>
          <label className="menu-search">
            <Search size={17} strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              placeholder={dim && label ? `Find a ${label.label.toLowerCase()}` : 'Find anything: a page, a country, a source…'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && values[0] && pick(values[0].dim, values[0].value)}
              aria-label="Search filters"
            />
          </label>

          {dim || needle ? (
            <div className="menu-list">
              {values.map((v) => {
                const d = ALL.find((x) => x.dim === v.dim)!
                return (
                  <button key={v.dim + v.value} type="button" role="menuitem" className="menu-row value" onClick={() => pick(v.dim, v.value)}>
                    {!dim && (
                      <span className="icon-tile small">
                        <d.icon size={15} strokeWidth={1.75} />
                      </span>
                    )}
                    <span className="menu-text">
                      <span className="menu-title" title={v.label}>
                        {v.label || '/'}
                      </span>
                      {!dim && <span className="menu-sub">{d.label}</span>}
                      <span className="menu-bar" aria-hidden="true">
                        <i style={{ width: `${(v.visitors / top) * 100}%` }} />
                      </span>
                    </span>
                    <span className="num faint">{v.visitors.toLocaleString()}</span>
                  </button>
                )
              })}
              {values.length === 0 && <p className="menu-empty">Nothing on this page matches “{q}”.</p>}
            </div>
          ) : (
            <div className="menu-list">
              {ALL.every((d) => count(d.dim) === 0) && <p className="menu-empty">No visits in this period yet. Pick a longer period to filter what was recorded.</p>}
              {FILTER_GROUPS.map((g) => {
                const live = g.dims.filter((d) => count(d.dim) > 0)
                if (!live.length) return null
                return (
                  <div key={g.name} className="menu-group">
                    <p className="menu-group-head">{g.name}</p>
                    {live.map((d) => (
                      <button key={d.dim} type="button" role="menuitem" className="menu-row" onClick={() => setDim(d.dim)}>
                        <span className={'icon-tile small' + (picked(d.dim) ? ' accent' : '')}>
                          <d.icon size={15} strokeWidth={1.75} />
                        </span>
                        <span className="menu-text">
                          <span className="menu-title">{d.label}</span>
                          <span className="menu-sub">
                            {count(d.dim)} value{count(d.dim) === 1 ? '' : 's'}
                            {picked(d.dim) && ' · filtered'}
                          </span>
                        </span>
                        <ChevronRight size={15} strokeWidth={1.75} className="faint" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )
              })}
              {(() => {
                const idle = ALL.filter((d) => count(d.dim) === 0)
                if (!idle.length) return null
                return (
                  <div className="menu-group">
                    <p className="menu-group-head">Nothing to pick yet</p>
                    {idle.map((d) => (
                      <div key={d.dim} className="menu-row idle">
                        <span className="icon-tile small">
                          <d.icon size={15} strokeWidth={1.75} />
                        </span>
                        <span className="menu-text">
                          <span className="menu-title">{d.label}</span>
                          <span className="menu-sub">{d.note === 'Full mode' ? 'Shown in Full mode' : 'Nothing recorded in this period'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {active.length > 0 && (
            <div className="menu-foot">
              <button type="button" className="menu-clear" onClick={() => (onClear(), close())}>
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
                Clear {active.length} filter{active.length > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
  )
}
