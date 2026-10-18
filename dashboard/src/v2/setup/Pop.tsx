import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface PopItem {
  label: string
  run: () => void
  checked?: boolean
}

/** A small button that opens a short menu: Escape or a click outside shuts it, the arrow keys move, and focus returns to the button. */
export function Pop({ label, className, items, up, children }: { label: string; className: string; items: PopItem[]; up?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    box.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const key = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const all = [...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
      const at = all.indexOf(document.activeElement as HTMLElement)
      all[(at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
    }
  }
  return (
    // The wrapper only catches keys bubbling up from its own buttons.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span className="spop" ref={box} onKeyDown={key}>
      <button ref={btn} type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {children}
      </button>
      {open && (
        <span className={`spmenu${up ? ' up' : ''}`} role="menu" aria-label={label}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={it.checked}
              onClick={() => {
                setOpen(false)
                it.run()
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
