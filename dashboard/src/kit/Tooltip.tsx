// A real tooltip. The browser's own title= never appears on a phone and takes a
// second on a desktop, so anywhere a mark explains something, it is this: hover,
// focus or tap, all three; Escape and a click elsewhere close it. The trigger is
// yours (a button): it gets what it needs to open and describe the tip.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import './Tooltip.css'

export type TipTrigger = { 'aria-describedby': string | undefined; onClick: () => void; onFocus: () => void; onBlur: () => void }

export function Tooltip({ text, align = 'left', children }: { text: string; align?: 'left' | 'right'; children: (p: TipTrigger) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
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
      {open && (
        <span className={align === 'right' ? 'tip right' : 'tip'} id={id} role="tooltip">
          {text}
        </span>
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
