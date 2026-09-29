// Whether the period's popover, the Filter menu and the saved views' list are open. Stores, so a
// phone's sheet and ⋯ can hand over to them once they have closed themselves.
import { miniStore } from '../lib/miniStore'

export const periodMenu = miniStore(false)
export const filterMenu = miniStore(false)
export const savedViews = miniStore(false)

// Where focus goes when the panel that is open closes: the control that opened
// it, named by whoever opened it (a browser may not focus a button on a click,
// so what had focus at that moment is no guide).
let opener: HTMLElement | null = null

export function openedFrom(el: HTMLElement | null) {
  opener = el
}

export function focusOpener() {
  const el = opener
  opener = null
  if (el) requestAnimationFrame(() => el.focus())
}

type Set = (open: boolean) => void

/** A button's click: toggles the panel and remembers the button for the way back. */
export const toggler = (set: Set, open: boolean) => (e: { currentTarget: HTMLElement }) => {
  opener = e.currentTarget
  set(!open)
}

/** Closes the panel and returns focus to whatever opened it. */
export const closer = (set: Set) => () => {
  set(false)
  focusOpener()
}
