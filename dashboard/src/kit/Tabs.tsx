// A row of tabs: one is selected, the arrow keys, Home and End move between
// them (the selected one is the only one in the tab order), and a row that is
// wider than its card scrolls sideways. The panel it controls is the caller's.
// `sub` is a list's own small row, a pill on the one picked.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import './kit.css'

export interface TabItem {
  id: string
  label: string
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`
export const panelId = (prefix: string) => `${prefix}-panel`

export function Tabs({ prefix, label, tabs, value, onChange, sub }: { prefix: string; label: string; tabs: TabItem[]; value: string; onChange: (id: string) => void; sub?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  // A row wider than its card fades on the side that has more, and the picked tab is kept in view.
  const [more, setMore] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const next = { left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }
    setMore((m) => (m.left === next.left && m.right === next.right ? m : next))
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Sideways only: the page itself never moves for a tab.
    const sel = el.querySelector<HTMLElement>('[aria-selected="true"]')?.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    if (sel && sel.left < box.left) el.scrollLeft -= box.left - sel.left + 8
    else if (sel && sel.right > box.right) el.scrollLeft += sel.right - box.right + 8
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, tabs.length, measure])
  const move = (e: KeyboardEvent, i: number) => {
    const last = tabs.length - 1
    const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key]
    if (to === undefined) return
    e.preventDefault()
    onChange(tabs[to].id)
    // The newly selected tab takes the focus once it is the one in the tab order.
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }
  return (
    <div ref={ref} onScroll={measure} className={(sub ? 'kit-subtabs' : 'kit-tabs') + (more.left ? ' more-left' : '') + (more.right ? ' more-right' : '')} role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={tabId(prefix, t.id)}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          aria-controls={sub ? undefined : panelId(prefix)}
          tabIndex={t.id === value ? 0 : -1}
          className={sub ? undefined : 'kit-tab'}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
