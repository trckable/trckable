// The ⋯ menu used wherever a row has more than one action. It renders into the
// page body, not inside the row, so a dialog or a scrolling card can never
// clip it — that is the whole reason this is a component and not a div.
import { Ellipsis } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function Menu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ top: 0, right: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    // Open downwards unless the bottom of the screen is closer than the menu
    // is tall; then flip above the button.
    const below = window.innerHeight - r.bottom
    const height = pop.current?.offsetHeight ?? 180
    setAt({ top: below < height + 16 ? Math.max(8, r.top - height - 6) : r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const close = () => setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', close)
    // Any scroll under an open menu moves the button: close rather than drift.
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button ref={btn} type="button" className="btn icon ghost" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="pop menu floating" role="menu" style={{ top: at.top, right: at.right }}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  )
}
