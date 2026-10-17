// What every sheet over the Briefing shares: Escape closes it, it takes focus, and opening one closes any other that is
// open, so two never stack.
import { useEffect, useRef, type RefObject } from 'react'

const OPENED = 'trckable:sheet'

export function useSheet(box: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const me = {}
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    const other = (e: Event) => (e as CustomEvent).detail !== me && close.current()
    window.addEventListener('keydown', key)
    window.addEventListener(OPENED, other)
    window.dispatchEvent(new CustomEvent(OPENED, { detail: me }))
    box.current?.focus()
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener(OPENED, other)
    }
  }, [box])
}
