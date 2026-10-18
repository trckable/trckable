import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { placePop, type PopAt } from '../../components/popPlace'

export interface PopItem {
  label: string
  run: () => void
  checked?: boolean
}

/** A small button that opens a short menu: Escape or a click outside shuts it, the arrow keys move, and focus returns to the button.
 * The menu is on the top layer, under the button and right-aligned with it (above when there is no room below), so the panel's edges and rows never clip or cover it. */
export function Pop({ label, className, items, children }: { label: string; className: string; items: PopItem[]; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<PopAt | null>(null)
  useLayoutEffect(() => {
    const el = menu.current
    const b = btn.current
    if (!open || !el || !b) return setAt(null)
    try {
      el.showPopover()
    } catch {
      // No top layer in this browser: the z-index lifts it.
    }
    const place = () => setAt(placePop(b.getBoundingClientRect(), { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }))
    place()
    // The panel follows the page: the menu goes with its button.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])
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
        <span ref={menu} popover="manual" className="spmenu" role="menu" aria-label={label} style={at ? menuStyle(at) : { visibility: 'hidden' }}>
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

const menuStyle = (at: PopAt): CSSProperties => ({ left: at.left, top: at.top, bottom: at.bottom, maxHeight: at.room })
