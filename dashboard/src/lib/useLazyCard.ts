import { useEffect, useRef, useState } from 'react'

// The page's own reads (the report and its side reads) go first: a card under
// the cards is asked for only once they are done, even when it sits in view at once.
const QUIET_MS = 1500

/** True once the page's own reads have had their moment: what a card that needs no marker waits for. */
export function useQuiet(): boolean {
  const [quiet, setQuiet] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setQuiet(true), QUIET_MS)
    return () => clearTimeout(t)
  }, [])
  return quiet
}

/** `near`: the card is about to be seen (render it instead of its marker). `load`: near, and the page's own reads are done. */
export function useLazyCard() {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  const mark = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = mark.current
    if (near || !el) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  const quiet = useQuiet()
  return { mark, near, load: near && quiet }
}
