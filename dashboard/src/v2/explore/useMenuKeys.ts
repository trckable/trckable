// The keyboard of the panel's lists: arrows through a menu (Left backs out of a filter's values, Right goes in), Tab
// leaves a menu, ArrowDown opens it from its button; Up and Down walk the section list; Left and Right walk the tabs.
// And where focus goes after a menu opens or shuts, so a keyboard never loses its place.
import { useRef, type KeyboardEvent, type RefObject } from 'react'
import type { PanelState } from './usePanelState'

const ITEMS = '.xmi:not([disabled]), .xmx'

export function useMenuKeys(body: RefObject<HTMLElement | null>, s: PanelState, shut: () => void) {
  const intent = useRef<string | null>(null)
  const el = () => body.current
  const into = () => {
    const menu = el()?.querySelector<HTMLElement>('.xm.on')
    const first = menu?.querySelector<HTMLElement>('.xmi.on') ?? menu?.querySelector<HTMLElement>(ITEMS)
    first?.focus()
  }
  return {
    /** Say where focus goes once the next render has happened: into the open menu, or back to a menu's button. */
    want: (what: string) => {
      intent.current = what
    },
    afterRender: () => {
      const what = intent.current
      if (!what) return
      intent.current = null
      if (what === 'in') into()
      else el()?.querySelector<HTMLElement>(`[data-xm="${what.slice(4)}"]`)?.focus()
    },
    onKey: (e: KeyboardEvent) => {
      const a = document.activeElement
      if (!(a instanceof HTMLElement)) return
      const menu = a.closest<HTMLElement>('.xm.on')
      if (menu) {
        const items = [...menu.querySelectorAll<HTMLElement>(ITEMS)]
        const i = items.indexOf(a)
        const move = (n: number) => {
          e.preventDefault()
          e.stopPropagation()
          items[n]?.focus()
        }
        if (e.key === 'ArrowDown') move((i + 1) % items.length)
        else if (e.key === 'ArrowUp') move((i - 1 + items.length) % items.length)
        else if (e.key === 'Home') move(0)
        else if (e.key === 'End') move(items.length - 1)
        else if (e.key === 'ArrowLeft' && s.fd) {
          e.preventDefault()
          menu.querySelector<HTMLElement>('[data-back]')?.click()
          intent.current = 'in'
        } else if (e.key === 'ArrowRight' && a.dataset.enter) {
          e.preventDefault()
          a.click()
        } else if (e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          const b = menu.parentElement?.querySelector<HTMLElement>('[data-xm]')
          shut()
          intent.current = `out:${b?.dataset.xm ?? ''}`
        }
        return
      }
      if (a.dataset.xm && e.key === 'ArrowDown') {
        e.preventDefault()
        if (s.menu === a.dataset.xm) into()
        else {
          intent.current = 'in'
          a.click()
        }
        return
      }
      if (a.classList.contains('xri') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const list = [...(el()?.querySelectorAll<HTMLElement>('.xrail .xri') ?? [])]
        const i = list.indexOf(a)
        e.preventDefault()
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
        return
      }
      if (a.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const tabs = [...(a.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])]
        const i = tabs.indexOf(a)
        e.preventDefault()
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
        next?.click()
        next?.focus()
      }
    },
  }
}
