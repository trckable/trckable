// One searchable picker, used wherever a list is long enough to scroll:
// install methods, timezones, currencies. A native <select> with 400 zones is
// a scroll race; this is a search box with keyboard control.
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PickItem = { id: string; label: string; group?: string; hint?: string }

export function Picker({
  items,
  value,
  onPick,
  placeholder = 'Search…',
  label,
  trigger,
  align = 'left',
}: {
  items: PickItem[]
  value?: string
  onPick: (id: string) => void
  placeholder?: string
  label: string
  trigger?: (current: PickItem | undefined, open: boolean) => React.ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const [at, setAt] = useState<{ top: number; left?: number; right?: number }>({ top: 0 })
  const root = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // The list is rendered into the page body, like the ⋯ menu, so a dialog or a
  // scrolling card can never cut it off. That means placing it by hand.
  useLayoutEffect(() => {
    if (!open || !root.current) return
    const r = root.current.getBoundingClientRect()
    const height = pop.current?.offsetHeight ?? 300
    const below = window.innerHeight - r.bottom
    const top = below < height + 16 && r.top > height + 16 ? r.top - height - 6 : Math.min(r.bottom + 6, Math.max(8, window.innerHeight - height - 8))
    setAt(align === 'right' ? { top, right: Math.max(8, window.innerWidth - r.right) } : { top, left: Math.max(8, r.left) })
  }, [open, align, q])

  useEffect(() => {
    if (!open) {
      setQ('')
      return
    }
    setI(0)
    search.current?.focus()
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!root.current?.contains(t) && !pop.current?.contains(t)) setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? items.filter((x) => (x.label + ' ' + (x.group ?? '') + ' ' + (x.hint ?? '')).toLowerCase().includes(t)) : items
  }, [items, q])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-on="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [i, q])

  const current = items.find((x) => x.id === value)
  const choose = (id: string) => {
    onPick(id)
    setOpen(false)
  }

  let lastGroup: string | undefined
  return (
    <div className="picker" ref={root}>
      <button type="button" className="btn picker-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {trigger ? (
          trigger(current, open)
        ) : (
          <>
            <span className="name">{current?.label ?? placeholder}</span>
            <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="pop picker-pop floating" role="listbox" aria-label={label} style={at}>
            <input
              ref={search}
              className="input"
              placeholder={placeholder}
              value={q}
              onChange={(e) => (setQ(e.target.value), setI(0))}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setI((n) => Math.min(n + 1, hits.length - 1)))
                else if (e.key === 'ArrowUp') (e.preventDefault(), setI((n) => Math.max(n - 1, 0)))
                else if (e.key === 'Enter' && hits[i]) (e.preventDefault(), choose(hits[i].id))
                else if (e.key === 'Escape') setOpen(false)
              }}
            />
            <div className="picker-list" ref={list}>
              {hits.map((x, n) => {
                const head = x.group && x.group !== lastGroup ? x.group : null
                lastGroup = x.group
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
                      {x.id === value && (
                        <Check size={16} strokeWidth={2} color="var(--accent)" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                )
              })}
              {hits.length === 0 && <p className="faint" style={{ margin: '8px 10px', fontSize: 13 }}>Nothing matches “{q}”.</p>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
