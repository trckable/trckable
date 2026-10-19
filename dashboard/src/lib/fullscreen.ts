// Full screen for one element: the browser's Fullscreen API where it exists, and where it does not (iOS Safari on a
// page) the element fills the window as a fixed overlay (it gets the `fill` class, styled by the caller). Esc leaves either.
import { useCallback, useEffect, useState, type RefObject } from 'react'

/** The browser's full screen if it gives it; `fallback` when it is missing, refuses, or says yes and does nothing (an embedded browser). */
export function enter(el: HTMLElement, fallback: () => void) {
  if (!document.fullscreenEnabled || !el.requestFullscreen) {
    fallback()
    return
  }
  try {
    el.requestFullscreen().then(() => document.fullscreenElement === el || fallback(), fallback)
  } catch {
    fallback()
  }
}

export function useFullscreen(ref: RefObject<HTMLElement | null>): { on: boolean; toggle: () => void } {
  const [real, setReal] = useState(false)
  const [overlay, setOverlay] = useState(false)
  useEffect(() => {
    const sync = () => setReal(!!ref.current && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])
  useEffect(() => {
    const el = ref.current
    el?.classList.toggle('fill', overlay)
    if (!overlay) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOverlay(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [overlay, ref])
  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (document.fullscreenElement === el) void document.exitFullscreen()
    else if (overlay) setOverlay(false)
    else enter(el, () => setOverlay(true))
  }, [ref, overlay])
  return { on: real || overlay, toggle }
}
