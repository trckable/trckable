// What every sheet over the Briefing shares: Escape closes it, it takes focus (Tab stays inside, and focus goes back to
// what opened it), and opening one closes any other that is open, so two never stack.
import { useEffect, useRef, type RefObject } from 'react'
import { trapTab } from '../../kit/Modal'

const OPENED = 'trckable:sheet'

export function useSheet(box: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const me = {}
    const opener = document.activeElement as HTMLElement | null
    const el = box.current
    const tab = (e: KeyboardEvent) => el && e.target && trapTab(e as Parameters<typeof trapTab>[0], el)
    el?.addEventListener('keydown', tab)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    const other = (e: Event) => (e as CustomEvent).detail !== me && close.current()
    window.addEventListener('keydown', key)
    window.addEventListener(OPENED, other)
    window.dispatchEvent(new CustomEvent(OPENED, { detail: me }))
    box.current?.focus()
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener(OPENED, other)
      el?.removeEventListener('keydown', tab)
      // Not while another sheet has just taken focus.
      if (opener && opener.isConnected && (document.activeElement === document.body || el?.contains(document.activeElement))) opener.focus()
    }
  }, [box])
}
