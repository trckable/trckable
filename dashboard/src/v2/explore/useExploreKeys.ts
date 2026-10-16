// Explore opens from the keyboard: ⌘K (Ctrl K) from anywhere, and E when nothing is being typed.
import { useEffect } from 'react'
import { exploreAsk, openExplore } from './store'

const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable]')

export function useExploreKeys() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (exploreAsk.get() || e.repeat) return
      const k = e.key.toLowerCase()
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && k === 'k'
      const plain = k === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !document.querySelector('[aria-modal="true"], .cd.on')
      if (!mod && !plain) return
      e.preventDefault()
      e.stopImmediatePropagation()
      openExplore()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
}
