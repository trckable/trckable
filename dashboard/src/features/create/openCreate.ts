// Opens the Create menu from elsewhere: the header's ⋯ menu (or the avatar
// menu that holds its items) has a Create item, and the menu itself stays
// where it always was (CreateMenu), so its dialogs and key are unchanged.
import { useSyncExternalStore } from 'react'

const EVENT = 'trckable:create'

export const openCreate = () => window.dispatchEvent(new Event(EVENT))

/** Calls `open` whenever something asks for the Create menu. */
export function onOpenCreate(open: () => void) {
  window.addEventListener(EVENT, open)
  return () => window.removeEventListener(EVENT, open)
}

// Whether the menu has anything to offer: with every entry's module off the
// header's Create item goes too.
let available = false
const subs = new Set<() => void>()

export function setCreateAvailable(on: boolean) {
  if (on === available) return
  available = on
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

export const useCreateAvailable = () => useSyncExternalStore(subscribe, () => available)
