// Full screen for one element. The element covers the window at once (it gets the `fill` class, styled by the caller as
// a fixed cover), so it works in any frame; the browser's real Fullscreen API is asked for as well and may say no, say
// yes and do nothing, or never answer: nothing here waits for it. Esc, or the same button, leaves either.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export function useFullscreen(ref: RefObject<HTMLElement | null>): { on: boolean; toggle: () => void } {
  const [on, setOn] = useState(false)
  // True once the browser really made it the full-screen element: leaving that (Esc) leaves ours too.
  const real = useRef(false)
  useEffect(() => {
    const sync = () => {
      if (ref.current && document.fullscreenElement === ref.current) real.current = true
      else if (real.current) {
        real.current = false
        setOn(false)
      }
    }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])
  useEffect(() => {
    ref.current?.classList.toggle('fill', on)
    if (!on) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOn(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [on, ref])
  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (on) {
      setOn(false)
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => undefined)
      return
    }
    setOn(true)
    try {
      void el.requestFullscreen?.().catch(() => undefined)
    } catch {
      /* the cover is already up */
    }
  }, [ref, on])
  return { on, toggle }
}
