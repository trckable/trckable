// A quiet row over a period chart: the period as a few segments on the left, and on the right (one row, one baseline) the
// legend of the two lines, one Compare menu and the Notes button. It reads and writes the address like the header's period
// menu does, so both stay in step.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, GitCompareArrows } from 'lucide-react'
import { hasYear } from '../periodWords'
import { copy } from '../briefing/copy'
import { readView, setView, useLocation, type ViewState } from '../../lib/url'
import { AGAINST, CHART_PERIODS, isOn, periodPatch, stepOf, switchPatch } from './chartPick'
import './chartRow.css'

export interface ChartControlsProps {
  site: { created_at?: number }
  /** Why a comparison that is on draws nothing; the year's menu item and the chip's tooltip say it. */
  why?: string | null
  /** The legend of the two lines, on the row beside the menu (a phone names the dashed line at its end instead). */
  legend?: ReactNode
  /** The Notes button, at the end of the row. */
  notes?: ReactNode
}

/** A row of choices that act as one control: arrows move through it, Tab leaves it. */
function Group<T extends string>({ label, items, value, text, onPick, cls }: { label: string; items: readonly T[]; value: T | null; text: (v: T) => string; onPick: (v: T) => void; cls: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  // A pick makes the page read the new period and hold the old one still (inert), which drops the focus: it goes back to the segment once the page can be reached again.
  const keep = useRef<number | null>(null)
  useEffect(() => {
    const el = keep.current === null ? null : refs.current[keep.current]
    if (!el || el.closest('[inert]')) return
    keep.current = null
    const at = document.activeElement
    if (!at || at === document.body) el.focus() // not when the person has moved on
  })
  const key = (e: KeyboardEvent, i: number) => {
    const to = stepOf(e.key, i, items.length)
    if (to < 0) return
    e.preventDefault()
    refs.current[to]?.focus()
    keep.current = to
    onPick(items[to])
  }
  const stop = value === null ? 0 : items.indexOf(value)
  return (
    <div className={`cc-seg ${cls}`} role="radiogroup" aria-label={label}>
      {items.map((v, i) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={v === value}
          tabIndex={i === stop ? 0 : -1}
          className={v === value ? 'on' : ''}
          onKeyDown={(e) => key(e, i)}
          onClick={() => onPick(v)}
        >
          {text(v)}
        </button>
      ))}
    </div>
  )
}

/** What the Compare chip says: quiet "Compare" while off, the choice in words while on. */
function chipText(on: boolean, against: string | null): string {
  if (!on) return copy.chartCompare
  return against === 'year' ? copy.vsYear : copy.vsPrevious
}

/** The comparison as one small menu: Previous period, Same time last year (disabled with its reason when the site is younger), Off. */
function CompareMenu({ on, against, year, why }: { on: boolean; against: string | null; year: boolean; why?: string | null }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLElement>('[aria-checked=true], [role^=menuitem]:not([aria-disabled])')?.focus()
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const pick = (patch: Partial<ViewState>) => {
    setView(patch)
    setOpen(false)
    btn.current?.focus()
  }
  const items: { key: string; text: string; checked: boolean; off?: string; patch: Partial<ViewState> }[] = [
    { key: 'previous', text: copy.againstPrevious, checked: on && against !== 'year', patch: { compare: 'previous' } },
    { key: 'year', text: copy.againstYear, checked: on && against === 'year', off: year ? undefined : copy.againstYearNeeds, patch: { compare: 'year' } },
    { key: 'none', text: copy.compareOff, checked: !on, patch: switchPatch(false) },
  ]
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
      return
    }
    const els = [...(box.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])]
    const to = stepOf(e.key, els.indexOf(document.activeElement as HTMLElement), els.length)
    if (to < 0 || e.key === 'ArrowLeft' || e.key === 'ArrowRight') return
    e.preventDefault()
    els[to]?.focus()
  }
  return (
    <div className="cc-menu" ref={box} role="presentation" onKeyDown={key}>
      <button ref={btn} type="button" className={`cc-chip${on ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} title={on && why ? why : undefined} onClick={() => setOpen((o) => !o)}>
        {!on && <GitCompareArrows size={13} aria-hidden="true" />}
        <span>{chipText(on, against)}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="cc-pop" id={id} role="menu" aria-label={copy.chartAgainst}>
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitemradio" aria-checked={it.checked} aria-disabled={it.off ? true : undefined} title={it.off} onClick={() => !it.off && pick(it.patch)}>
              <span>{it.text}</span>
              {it.off && <small>{it.off}</small>}
            </button>
          ))}
          {on && why && <p className="mk-quiet cc-why" role="note">{why}</p>}
        </div>
      )}
    </div>
  )
}

export function ChartControls({ site, why, legend, notes }: ChartControlsProps) {
  const view: ViewState = readView(useLocation().params)
  const on = isOn(view.compare)
  const period = CHART_PERIODS.find((p) => p === view.period) ?? null
  const against = AGAINST.find((a) => a === view.compare) ?? null
  return (
    <div className="cc" data-testid="chart-controls">
      <Group cls="cc-period" label={copy.chartPeriods} items={CHART_PERIODS} value={period} text={(p) => copy.chartShort[p]} onPick={(p) => setView(periodPatch(p))} />
      <div className="cc-cmp">
        {on && legend}
        <CompareMenu on={on} against={against} year={hasYear(site)} why={why} />
        {notes}
      </div>
    </div>
  )
}
