// A real tooltip. The browser's own title= never appears on a phone and takes a
// second on a desktop, so anywhere a mark explains something, it is this: hover,
// focus or tap, all three; Escape and a click elsewhere close it. The trigger is
// yours (a button): it gets what it needs to open and describe the tip.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

export type TipTrigger = { 'aria-describedby': string | undefined; onClick: () => void; onFocus: () => void; onBlur: () => void }

/** Where a tip of this size goes: under its trigger, or over it when there is no room under, and never past the window's edges. */
export function placeTip(r: { left: number; right: number; top: number; bottom: number }, w: number, h: number, vw: number, vh: number, align: 'left' | 'right'): { left: number; top: number } {
  const M = 8
  const left = Math.max(M, Math.min(align === 'right' ? r.right - w : r.left, vw - w - M))
  const under = r.bottom + 6
  const top = under + h > vh - M && r.top - 6 - h >= M ? r.top - 6 - h : Math.max(M, Math.min(under, vh - h - M))
  return { left, top }
}

/** The tip is drawn on the top layer of the page (a popover), so no card's overflow or stacking can clip or cover it. */
export function Tooltip({ text, align = 'left', children }: { text: string; align?: 'left' | 'right'; children: (p: TipTrigger) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<CSSProperties | null>(null)
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = tip.current
    if (!open || !el || !root.current) return setAt(null)
    try {
      el.showPopover()
    } catch {
      // No top layer in this browser: the high z-index still lifts it.
    }
    const w = el.offsetWidth
    const h = el.offsetHeight
    setAt(placeTip(root.current.getBoundingClientRect(), w, h, document.documentElement.clientWidth, window.innerHeight, align))
  }, [open, text, align])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const move = () => setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', move, true)
    window.addEventListener('resize', move)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', move, true)
      window.removeEventListener('resize', move)
    }
  }, [open])
  return (
    <span className="info" ref={root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children({ 'aria-describedby': open ? id : undefined, onClick: () => setOpen((o) => !o), onFocus: () => setOpen(true), onBlur: () => setOpen(false) })}
      {open &&
        createPortal(
          <span ref={tip} popover="manual" className="tip tip-top" id={id} role="tooltip" style={at ?? { visibility: 'hidden' }}>
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
