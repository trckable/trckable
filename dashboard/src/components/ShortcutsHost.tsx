// Listens for the shortcuts key everywhere and opens the list; the Features key
// opens the Features pop-up. Each is
// its own chunk: the key costs nothing until somebody presses it. The keys that
// open a menu or press a button on the page (Switch site, Your menu, Settings,
// Filter, Share, Replay) click the control that carries their name in
// data-key, so a key does exactly what its button does, and nothing when the
// page has no such button.
import { lazy, Suspense, useEffect, useState } from 'react'
import { openFeatures } from './AccountMenu'
import { pressed } from '../lib/keys'

const Shortcuts = lazy(() => import('../views/Shortcuts'))
const CLICKS = ['site', 'user', 'settings', 'filter', 'share', 'replay']

/** The control a shortcut stands for, when it is on the page, on screen and enabled. */
function control(id: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(`[data-key="${id}"]`)].find((el) => el.offsetParent !== null && !(el as HTMLButtonElement).disabled)
}

/** Open the list from anywhere: a menu item, a button, another dialog. */
export function openShortcuts() {
  window.dispatchEvent(new CustomEvent('trckable:shortcuts'))
}

export function ShortcutsHost() {
  const [open, setOpen] = useState(false)
  // A link that asked for it (/?features).
  useEffect(() => {
    if (/[?&]features\b/.test(location.search)) openFeatures()
  }, [])
  useEffect(() => {
    const show = () => setOpen(true)
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest?.('input, textarea, select, [contenteditable]')) return
      if (pressed(e, 'shortcuts')) {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      // Under a dialog the page is not the one being used.
      if (document.querySelector('[aria-modal="true"]')) return
      if (pressed(e, 'features')) {
        openFeatures()
        return
      }
      const id = CLICKS.find((c) => pressed(e, c))
      const button = id && control(id)
      if (button) {
        e.preventDefault()
        button.click()
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
