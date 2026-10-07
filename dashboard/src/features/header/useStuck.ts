// Whether a sticky line has reached the top and the page is scrolling under
// it: a zero-height marker sits just above the line, and once that has
// scrolled out of sight the line is stuck.
import { useEffect, useRef, useState } from 'react'

export function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  })
  return { sentinel, stuck }
}
