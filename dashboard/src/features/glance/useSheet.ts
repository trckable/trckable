// What a dialog needs: Esc closes it, Tab stays inside it, focus goes in when
// it opens and back to what opened it when it closes.
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useSheet(ref: RefObject<HTMLElement | null>, onClose: () => void, opener: HTMLElement | null) {
  useEffect(() => {
    const el = ref.current
    ;(el?.querySelector<HTMLElement>('[data-first]') ?? el)?.focus()
    const onKey = (e: KeyboardEvent) => {
      // Only the dialog on top answers (the palette can open over the panel).
      const all = document.querySelectorAll('.g-sheet, .g-pal')
      if (all[all.length - 1] !== el) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      if (e.shiftKey && (at === first || at === el)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && at === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (opener?.isConnected) opener.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opens once per mount; the handlers read the latest props through the closure of that mount
  }, [])
}
