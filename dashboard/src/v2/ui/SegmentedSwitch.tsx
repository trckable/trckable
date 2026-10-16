// The one switch of the walkthrough (Live | Briefing, and the sub-switches of Explore): a pill glides under the chosen one.
import type { ReactNode } from 'react'

export interface SwitchItem<T extends string> {
  value: T
  label: ReactNode
  title?: string
  /** A dot before the label: it is red while the site is down. */
  dot?: 'ok' | 'down'
  count?: number
}

export function SegmentedSwitch<T extends string>({ items, value, onChange, label, id }: { items: SwitchItem<T>[]; value: T | null; onChange: (v: T) => void; label: string; id?: string }) {
  const i = items.findIndex((x) => x.value === value)
  return (
    <div className="seg" id={id} data-i={i} role="tablist" aria-label={label}>
      <i className="spill" />
      {items.map((x) => (
        <button key={x.value} type="button" role="tab" aria-selected={x.value === value} className={x.value === value ? 'on' : ''} title={x.title} onClick={() => onChange(x.value)}>
          {x.dot && <span className={`dot ${x.dot === 'down' ? 'down' : ''}`} />}
          {x.label}
          {x.count !== undefined && x.count > 0 && <span className="cnt"> {x.count}</span>}
        </button>
      ))}
    </div>
  )
}
