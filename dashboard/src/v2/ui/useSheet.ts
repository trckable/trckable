// What every sheet over the Briefing shares: Escape closes it, it takes focus (Tab stays inside, and focus goes back to
// what opened it), and opening one closes any other that is open, so two never stack. Escape closes the sheet and
// nothing under it (the Explore panel it may sit over), and its last moment is a short fade, not a cut.
import { useEffect, useRef, type RefObject } from 'react'
import { leave, trapTab } from '../../kit/Modal'

const OPENED = 'trckable:sheet'

/** Closes every open sheet (the logo goes home from wherever the person is). */
export const closeSheets = () => window.dispatchEvent(new CustomEvent(OPENED, { detail: {} }))

export function useSheet(box: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const me = {}
    const opener = document.activeElement as HTMLElement | null
    const el = box.current
    const portal = el?.parentElement
    const tab = (e: KeyboardEvent) => el && e.target && trapTab(e as Parameters<typeof trapTab>[0], el)
    el?.addEventListener('keydown', tab)
    const key = (e: KeyboardEvent) => {
      // A dialog opened from the sheet is on top, and hears Escape itself.
      if (e.key !== 'Escape' || document.querySelector('.modal-back:not(.leaving)')) return
      e.stopImmediatePropagation()
      close.current()
    }
    const other = (e: Event) => (e as CustomEvent).detail !== me && close.current()
    window.addEventListener('keydown', key, true)
    window.addEventListener(OPENED, other)
    window.dispatchEvent(new CustomEvent(OPENED, { detail: me }))
    box.current?.focus()
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener(OPENED, other)
      el?.removeEventListener('keydown', tab)
      if (portal?.classList.contains('mk-portal')) leave(portal)
      // Not while another sheet has just taken focus.
      if (opener && opener.isConnected && (document.activeElement === document.body || el?.contains(document.activeElement))) opener.focus()
    }
  }, [box])
}
