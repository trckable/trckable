// A row of tabs: one is selected, the arrow keys, Home and End move between
// them (the selected one is the only one in the tab order), and a row that is
// wider than its card scrolls sideways. The panel it controls is the caller's.
// `sub` is a list's own small row, a pill on the one picked.
import { useRef, type KeyboardEvent } from 'react'
import './kit.css'

export interface TabItem {
  id: string
  label: string
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`
export const panelId = (prefix: string) => `${prefix}-panel`

export function Tabs({ prefix, label, tabs, value, onChange, sub }: { prefix: string; label: string; tabs: TabItem[]; value: string; onChange: (id: string) => void; sub?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
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
    <div ref={ref} className={sub ? 'kit-subtabs' : 'kit-tabs'} role="tablist" aria-label={label}>
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
