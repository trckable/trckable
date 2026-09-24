// Listens for the shortcuts key everywhere and opens the list. The list is
// its own chunk: the key costs nothing until somebody presses it.
import { lazy, Suspense, useEffect, useState } from 'react'
import { pressed } from '../lib/keys'

const Shortcuts = lazy(() => import('../views/Shortcuts'))

/** Open the list from anywhere: a menu item, a button, another dialog. */
export function openShortcuts() {
  window.dispatchEvent(new CustomEvent('trckable:shortcuts'))
}

export function ShortcutsHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest?.('input, textarea, select, [contenteditable]')) return
      if (pressed(e, 'shortcuts')) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('trckable:shortcuts', show)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('trckable:shortcuts', show)
      window.removeEventListener('keydown', key)
    }
  }, [])
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <Shortcuts onClose={() => setOpen(false)} />
    </Suspense>
  )
}
