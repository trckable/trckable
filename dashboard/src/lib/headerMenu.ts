// The header's menus. Only one is open at a time: opening one tells the
// others to close.
import { useEffect, type ReactNode, type RefObject } from 'react'

/** A menu's items, given `go`: a choice that closes the menu, then runs. */
export type MenuItems = (go: (fn: () => void) => () => void) => ReactNode

const OPEN = 'trckable:menu-open'

/** Closes this menu when another header menu opens. */
export function useOnlyOpen(id: string, open: boolean, close: () => void) {
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent(OPEN, { detail: id }))
  }, [open, id])
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) close()
    }
    window.addEventListener(OPEN, on)
    return () => window.removeEventListener(OPEN, on)
  }, [id, close])
}

const ITEMS = '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled])'

/** The item to focus after `key` from the one at `at` (-1: none is focused
 *  yet), or null when the key moves nothing. Arrows wrap round. */
export function nextItem(key: string, at: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return at < 0 ? 0 : (at + 1) % count
  if (key === 'ArrowUp') return at < 0 ? count - 1 : (at - 1 + count) % count
  return null
}

/** Keyboard use of a header menu: it opens onto its first item, the arrows,
 *  Home and End move between items, Escape closes it and focus returns to
 *  its button, and Tab leaves it closed behind. The items may arrive a moment
 *  after the menu opens (their own chunk), so the first focus waits for them. */
export function useMenuNav(open: boolean, root: RefObject<HTMLElement | null>, button: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])
    let tries = 0
    let frame = 0
    // A pointer opening the menu leaves focus where it is; a key opens onto the first item.
    const focusFirst = () => {
      const first = items()[0]
      if (first) first.focus()
      else if (tries++ < 30) frame = requestAnimationFrame(focusFirst)
    }
    if (root.current?.contains(document.activeElement) || document.activeElement === button.current) focusFirst()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
        button.current?.focus()
        return
      }
      if (e.key === 'Tab') {
        close()
        return
      }
      const list = items()
      const to = nextItem(e.key, list.indexOf(document.activeElement as HTMLElement), list.length)
      if (to === null || !root.current?.contains(document.activeElement)) return
      e.preventDefault()
      list[to].focus()
    }
    document.addEventListener('keydown', key, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', key, true)
    }
  }, [open, root, button, close])
}
