// The header's menus. Only one is open at a time: opening one tells the
// others to close.
import { useEffect, type ReactNode } from 'react'

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
