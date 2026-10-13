// A real tooltip. The browser's own title= never appears on a phone and takes a
// second on a desktop, so anywhere a mark explains something, it is this: hover,
// focus or tap, all three; Escape and a click elsewhere close it. The trigger is
// yours (a button): it gets what it needs to open and describe the tip.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

export type TipTrigger = { 'aria-describedby': string | undefined; onClick: () => void; onFocus: () => void; onBlur: () => void }

/** `float` lifts the tip out to the page, beside the trigger, for triggers inside a list that scrolls and clips (the site switcher). */
export function Tooltip({ text, align = 'left', float = false, children }: { text: string; align?: 'left' | 'right'; float?: boolean; children: (p: TipTrigger) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<CSSProperties | null>(null)
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!open || !float || !root.current) return setAt(null)
    // Beside the panel the trigger sits in, at the trigger's height: right of it when there is room, else left.
    const r = root.current.getBoundingClientRect()
    const box = (root.current.closest('.pop') ?? root.current).getBoundingClientRect()
    const side = window.innerWidth - box.right >= 220 ? { left: box.right + 8, right: 'auto' } : { left: 'auto', right: window.innerWidth - box.left + 8 }
    setAt({ position: 'fixed', top: r.top - 6, ...side, zIndex: 1000 })
  }, [open, float])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <span className="info" ref={root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children({ 'aria-describedby': open ? id : undefined, onClick: () => setOpen((o) => !o), onFocus: () => setOpen(true), onBlur: () => setOpen(false) })}
      {open && !float && (
        <span className={align === 'right' ? 'tip right' : 'tip'} id={id} role="tooltip">
          {text}
        </span>
      )}
      {open && float && at && createPortal(
        <span className="tip" id={id} role="tooltip" style={at}>
          {text}
        </span>,
        document.body,
      )}
    </span>
  )
}

/** A few words that explain themselves: the text as a quiet button with the tooltip under it (hover, focus or tap). */
export function TipText({ text, tip, align = 'left', className = '' }: { text: ReactNode; tip: string; align?: 'left' | 'right'; className?: string }) {
  return (
    <Tooltip text={tip} align={align}>
      {(p) => (
        <button type="button" className={`tip-text ${className}`} {...p}>
          {text}
        </button>
      )}
    </Tooltip>
  )
}
