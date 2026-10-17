// The foot of the site list: Add a site and Settings in one row, and the rest of what belongs to the site (tracking, share, the
// status page, widgets) one tap away under More. A viewer, who has nothing in the row, sees those at once.
import { useState, type ReactNode } from 'react'
import { copy } from '../copy'

export interface FootItem {
  key: string
  label: ReactNode
  run: () => void
  dot?: 'ok' | 'warn'
  /** Under More, not in the row. */
  more?: boolean
}

export function MenuFoot({ items, done }: { items: FootItem[]; done: () => void }) {
  const [open, setOpen] = useState(false)
  const row = items.filter((f) => !f.more)
  const rest = items.filter((f) => f.more)
  const shown = open || row.length === 0
  const button = (f: FootItem) => (
    <button key={f.key} type="button" data-stop className="mi" onClick={() => { f.run(); done() }}>
      {f.dot && <i className={`pdot${f.dot === 'warn' ? ' warn' : ''}`} />}
      {f.label}
    </button>
  )
  return (
    <div className="mfoot-wrap">
      <div className="mfoot sfoot">
        {row.map(button)}
        {rest.length > 0 && row.length > 0 && (
          <button type="button" data-stop className="mi more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {copy.more}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={open ? 'up' : undefined}>
              <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" fill="none" strokeWidth="1.5" />
            </svg>
          </button>
        )}
      </div>
      {shown && rest.length > 0 && <div className="mfoot col sfoot-more">{rest.map(button)}</div>}
    </div>
  )
}
