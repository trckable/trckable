// The ring's words, kept where the site menu can read them: when the header is too narrow for the ring, the menu has a
// line for it that says the same and opens the same panel.
import { useSyncExternalStore } from 'react'

const OPEN = 'trckable:setup-open'
let words: string | null = null
const subs = new Set<() => void>()

export function publishSetup(next: string | null) {
  if (next === words) return
  words = next
  subs.forEach((f) => f())
}

export const useSetupWords = (): string | null =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => void subs.delete(f)
    },
    () => words,
  )

export const openSetup = () => window.dispatchEvent(new Event(OPEN))
export const onSetupOpen = (fn: () => void) => {
  window.addEventListener(OPEN, fn)
  return () => window.removeEventListener(OPEN, fn)
}
