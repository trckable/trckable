// Keeps Tab inside a dialog while it is open, and puts focus back where it
// was when it closes. The first focusable element gets focus on open unless
// something inside already asked for it (autoFocus). `also`: a selector for
// things drawn outside the box (a side card) that Tab may still reach, after it.
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref: RefObject<HTMLElement | null>, also?: string) {
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const before = document.activeElement as HTMLElement | null
    const outside = () => (also ? [...document.querySelectorAll<HTMLElement>(also)].flatMap((o) => [...o.querySelectorAll<HTMLElement>(FOCUSABLE)]) : [])
    const all = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE), ...outside()]
    if (!box.contains(document.activeElement)) all()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (!box.contains(e.target as Node) && !(also && (e.target as Element).closest?.(also))) return
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
    // On the document, so Tab is seen from the cards too; it ignores what is neither.
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [ref, also])
}
