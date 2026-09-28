import { useLayoutEffect, useRef, useState } from 'react'

/** The element's width, kept up to date: charts draw in real pixels, so text
 *  stays the same size on a phone and on a wide screen. */
export function useWidth<T extends HTMLElement>(initial = 320) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setW(Math.max(120, Math.round(el.getBoundingClientRect().width)))
    measure()
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}
