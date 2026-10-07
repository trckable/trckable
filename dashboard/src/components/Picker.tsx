// One searchable picker, used wherever a list is long enough to scroll:
// install methods, timezones, currencies. A native <select> with 400 zones is
// a scroll race; this is a search box with keyboard control. It is a kit
// Popover: placement, Escape, outside click, focus in and back, and the phone
// sheet are the Popover's; the highlighted row and Enter are this file's.
import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Popover } from '../kit'
import './Picker.css'

export type PickItem = { id: string; label: string; group?: string; hint?: string }

function Body({ items, value, onPick, placeholder, label, close }: { items: PickItem[]; value?: string; onPick: (id: string) => void; placeholder: string; label: string; close: () => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? items.filter((x) => (x.label + ' ' + (x.group ?? '') + ' ' + (x.hint ?? '')).toLowerCase().includes(t)) : items
  }, [items, q])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-on="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [i, q])

  const choose = (id: string) => {
    onPick(id)
    close()
  }
  // The arrows move the highlight here, so the Popover's own arrow keys stay out of it.
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setI((n) => Math.min(n + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      setI((n) => Math.max(n - 1, 0))
    } else if (e.key === 'Enter' && hits[i]) {
      e.preventDefault()
      choose(hits[i].id)
    }
  }
  return (
    <>
      <label className="menu-search">
        <Search size={17} strokeWidth={1.75} aria-hidden="true" />
        <input
          data-autofocus
          type="search"
          aria-label={placeholder}
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setI(0)
          }}
          onKeyDown={keys}
        />
      </label>
      <div className="picker-list" ref={list} role="listbox" aria-label={label}>
        {hits.map((x, n) => {
          const head = x.group && x.group !== hits[n - 1]?.group ? x.group : null
          return (
            <div key={x.id}>
              {head && <div className="picker-group">{head}</div>}
              <button
                type="button"
                role="option"
                aria-selected={x.id === value}
                data-on={n === i ? '1' : '0'}
                className={n === i ? 'picker-row on' : 'picker-row'}
                onMouseEnter={() => setI(n)}
                onClick={() => choose(x.id)}
              >
                <span className="name">{x.label}</span>
                {x.hint && <span className="faint">{x.hint}</span>}
                {x.id === value && <Check size={16} strokeWidth={2} color="var(--accent)" aria-hidden="true" />}
              </button>
            </div>
          )
        })}
        {hits.length === 0 && <p className="faint" style={{ margin: '8px 10px', fontSize: 13 }}>Nothing matches “{q}”.</p>}
      </div>
    </>
  )
}

export function Picker({
  items,
  value,
  onPick,
  placeholder = 'Search…',
  label,
  trigger,
}: {
  items: PickItem[]
  value?: string
  onPick: (id: string) => void
  placeholder?: string
  label: string
  trigger?: (current: PickItem | undefined, open: boolean) => ReactNode
}) {
  const current = items.find((x) => x.id === value)
  return (
    <div className="picker">
      <Popover
        label={label}
        className="picker-pop"
        trigger={(p) => (
          <button type="button" className="btn picker-btn" {...p} aria-haspopup="listbox" aria-label={label}>
            {trigger ? (
              trigger(current, p['aria-expanded'])
            ) : (
              <>
                <span className="name">{current?.label ?? placeholder}</span>
                <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" />
              </>
            )}
          </button>
        )}
      >
        {(close) => <Body items={items} value={value} onPick={onPick} placeholder={placeholder} label={label} close={close} />}
      </Popover>
    </div>
  )
}
