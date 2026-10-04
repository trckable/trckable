// The ⋯ menu of a widget's row: what can be done with one widget.
import { Ellipsis } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useMenuNav } from '../lib/headerMenu'
import { TEXT } from './widgetKinds'

export interface WidgetMenuItem {
  label: string
  icon: ReactNode
  run: () => void
}

export function WidgetMenu({ items }: { items: WidgetMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  useMenuNav(open, root, button, close)
  return (
    <div ref={root} className="wg-menu">
      <button ref={button} type="button" className="btn icon ghost" aria-haspopup="menu" aria-expanded={open} aria-label={TEXT.menu} title={TEXT.menu} onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="pop menu" role="menu" aria-label={TEXT.menu}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                button.current?.focus()
                it.run()
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
