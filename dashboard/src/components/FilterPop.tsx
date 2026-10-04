// The Filter list itself, loaded when the button is pressed (FilterMenu.tsx):
// for the times you know what you are looking for but it is not on the page.
// Clicking a row is the fast way in; this is the way when it is the 400th.
//
// Values come from the report that is already loaded, so opening this costs
// nothing and asks the server nothing. One search box looks through every
// dimension at once ("germany" finds Country: Germany); a dimension the current
// report does not carry — regions and cities in Core — is folded into one row
// at the bottom, rather than a column of greyed-out rows.
import { ChevronLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Filter, Row } from '../lib/api'
import { hasDim, hasValue, setsOf } from '../lib/filterSet'
import { nextItem } from '../lib/headerMenu'
import { usePhoneLock } from './lockScroll'
import { ALL_DIMS } from './filterGroups'
import { filterCopy as t } from './filterCopy'
import { DimRows, IdleRows, ValueRows } from './FilterRows'
import './ListPop.css'
import './FilterPop.css'

export default function FilterPop({
  rows,
  siblings,
  labelFor,
  active,
  onPick,
  onRemove,
  onClear,
  root,
  onClose,
}: {
  /** The rows already on the page for one dimension. */
  rows: (dim: string) => Row[]
  /** The values of a dimension that is already filtered, as the page would list them without that filter: a second value to pick for any of. */
  siblings?: (dim: string) => Promise<Row[]>
  /** How a value is written for a person: a country code is not a country. */
  labelFor: (dim: string, value: string) => string
  active: Filter[]
  onPick: (dim: string, value: string) => void
  onRemove: (f: Filter) => void
  onClear: () => void
  /** The button and the list together: a click outside both closes it. */
  root: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  usePhoneLock()
  const [dim, setDim] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape steps back one level before it closes the whole thing.
      if (dim) setDim(null)
      else onClose()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [dim, onClose, root])

  // A new level starts with an empty search.
  const [searchDim, setSearchDim] = useState(dim)
  if (searchDim !== dim) {
    setSearchDim(dim)
    setQ('')
  }
  useEffect(() => {
    search.current?.focus()
  }, [dim])

  // A dimension with a filter on lists only what the filter leaves; its other values come when it is opened.
  const [wider, setWider] = useState<Record<string, Row[]>>({})
  const openDim = (d: string) => {
    setDim(d)
    if (siblings && hasDim(active, d)) siblings(d).then((r) => setWider((w) => ({ ...w, [d]: r }))).catch(() => undefined)
  }

  const needle = q.trim().toLowerCase()
  const valuesOf = (d: string) =>
    (wider[d] ?? rows(d))
      .map((r) => ({ dim: d, value: r.value, label: labelFor(d, r.value), visitors: r.visitors }))
      .filter((v) => !needle || v.label.toLowerCase().includes(needle) || v.value.toLowerCase().includes(needle))

  // One dimension picked: its values. Nothing picked but a search typed: the
  // matching values across every dimension, best first.
  const values = useMemo(() => {
    if (dim) return valuesOf(dim).slice(0, 60)
    if (!needle) return []
    return ALL_DIMS.flatMap((d) => valuesOf(d.dim))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 40)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valuesOf is rebuilt every render from exactly these values
  }, [dim, needle, rows, labelFor, wider])

  const count = (d: string) => rows(d).length
  const picked = (d: string) => active.some((f) => f.dim === d)
  const label = dim ? ALL_DIMS.find((d) => d.dim === dim) : null
  // The list stays open: somebody narrowing by channel is often about to
  // narrow by country too. Picking goes back to the list; picking a value that
  // is already on takes it off. A click outside, or Escape, closes it.
  const isOn = (d: string, v: string) => hasValue(active, d, v)
  const pick = (d: string, v: string) => {
    if (isOn(d, v)) onRemove(active.find((f) => f.dim === d && f.value === v) ?? { dim: d, value: v })
    else onPick(d, v)
    setDim(null)
    setQ('')
    setWider({}) // the other filters changed: what a dimension can still offer did too
    search.current?.focus()
  }
  // ↑/↓ walk the search and the rows.
  const arrows = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const stops = [...(box.current?.querySelectorAll<HTMLElement>('input, [role=menuitem]') ?? [])]
    const to = nextItem(e.key, stops.indexOf(document.activeElement as HTMLElement), stops.length)
    if (to === null) return
    e.preventDefault()
    stops[to].focus()
  }
  const showValues = !!dim || !!needle
  const nothing = ALL_DIMS.every((d) => count(d.dim) === 0)

  return (
    <div ref={box} className="pop lpop filter-pop" role="menu" tabIndex={-1} aria-label={t.search} onKeyDown={arrows}>
      <div className="lsearch">
        {dim ? (
          <button type="button" className="back" onClick={() => setDim(null)} aria-label={t.back}>
            <ChevronLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : (
          <Search size={15} strokeWidth={1.75} aria-hidden="true" />
        )}
        <input
          ref={search}
          type="search"
          placeholder={label ? t.findIn(label.label) : t.placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && values[0] && pick(values[0].dim, values[0].value)}
          aria-label={t.search}
        />
        {dim && <span className="faint num">{count(dim)}</span>}
        {!dim && active.length > 0 && (
          <button
            type="button"
            className="clr"
            onClick={() => {
              onClear()
              onClose()
            }}
          >
            {t.clear(setsOf(active).length)}
          </button>
        )}
      </div>
      <div className="llist">
        {showValues && <ValueRows values={values} showDim={!dim} isOn={isOn} onPick={pick} />}
        {showValues && values.length === 0 && <p className="lempty">{t.noMatch(q)}</p>}
        {!showValues && nothing && <p className="lempty">{t.noVisits}</p>}
        {!showValues && <DimRows count={count} picked={picked} onOpen={openDim} />}
        {!showValues && <IdleRows count={count} />}
      </div>
    </div>
  )
}
