// Whether an element is on screen or about to be: the cards under the half hour read their own figures only then, so a
// visit that stays on the top of Live never asks for them.
import { useCallback, useEffect, useRef, useState } from 'react'

export function useNear<T extends Element>(margin = 200): [(el: T | null) => void, boolean] {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  const watch = useRef<IntersectionObserver | null>(null)
  useEffect(() => () => watch.current?.disconnect(), [])
  const ref = useCallback(
    (el: T | null) => {
      watch.current?.disconnect()
      if (!el || near || typeof IntersectionObserver === 'undefined') return
      watch.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setNear(true)
            watch.current?.disconnect()
          }
        },
        { rootMargin: `${margin}px` },
      )
      watch.current.observe(el)
    },
    [near, margin],
  )
  return [ref, near]
}
