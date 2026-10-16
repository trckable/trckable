// The keys that belong to the open panel as a whole: Esc shuts the menu that is open, or else the panel (from anywhere in
// it, an input too); F toggles full width; Tab stays inside it. The keys of one menu or one list are in PanelContent.
import { useEffect, type RefObject } from 'react'
import { closeExplore } from './open'

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'

/** The first thing in the panel that can take focus and is on screen. */
export const firstFocusable = (el: HTMLElement | null): HTMLElement | undefined => [...(el?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].find((x) => !(x as HTMLButtonElement).disabled && x.getClientRects().length > 0)

const typing = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)

export function usePanelKeys(box: RefObject<HTMLElement | null>, on: boolean, toggleFull: () => void) {
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      const el = box.current
      if (!el) return
      if (e.key === 'Escape') {
        const menu = el.querySelector<HTMLElement>('.xm.on')
        e.stopImmediatePropagation()
        if (menu) {
          const b = menu.parentElement?.querySelector<HTMLElement>('[data-xm]')
          b?.click()
          b?.focus()
        } else closeExplore()
        return
      }
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
        e.preventDefault()
        toggleFull()
        return
      }
      if (e.key !== 'Tab') return
      const all = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !(x as HTMLButtonElement).disabled && x.getClientRects().length > 0)
      if (!all.length) {
        e.preventDefault()
        return
      }
      const first = all[0]
      const last = all[all.length - 1]
      const at = document.activeElement
      const inside = !!at && el.contains(at)
      if (e.shiftKey && (at === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (at === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [box, on, toggleFull])
}
