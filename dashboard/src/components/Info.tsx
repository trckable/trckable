// A real tooltip. The browser's own title= never appears on a phone and takes
// a second on a desktop, so anywhere an (i) explains something, it is this:
// hover, focus or tap, all three.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import './Info.css'

/** `children` replace the (i): a small badge that explains itself the same way. */
export function Info({ text, align = 'left', children }: { text: string; align?: 'left' | 'right'; children?: ReactNode }) {
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
      <button
        type="button"
        className={children ? 'info-badge' : 'info-dot'}
        aria-describedby={open ? id : undefined}
        aria-label={children ? text : 'More about this'}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children ?? 'i'}
      </button>
      {open && (
        <span className={align === 'right' ? 'tip right' : 'tip'} id={id} role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
