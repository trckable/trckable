// Keeps Tab inside a dialog while it is open, and puts focus back where it
// was when it closes. The first focusable element gets focus on open unless
// something inside already asked for it (autoFocus).
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const before = document.activeElement as HTMLElement | null
    const all = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!box.contains(document.activeElement)) all()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = all()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    box.addEventListener('keydown', onKey)
    return () => {
      box.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [ref])
}
