import { useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export type Fit = 'tiny' | 'narrow' | 'wide'

/** How roomy Live's left card is: under 480 px the numbers shrink, under 560 px the bottom row is one column. */
export function fitOf(width: number): Fit {
  if (width < 480) return 'tiny'
  return width < 560 ? 'narrow' : 'wide'
}

/**
 * The card's fit, followed as it is resized (the card is not always as wide as the screen). `ref` goes on the card; it may appear later than the first render.
 * Live stays built, out of sight, while the Briefing is shown: with no width the fit is left as it was, and when the card is shown again
 * its new width is applied before the frame is painted (not a frame later), so nothing is seen to resize.
 */
export function useFit<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null)
  const [fit, setFit] = useState<Fit>('wide')
  useLayoutEffect(() => {
    if (!el) return
    const read = (now: boolean) => {
      const w = el.getBoundingClientRect().width
      if (w <= 0) return
      if (now) flushSync(() => setFit(fitOf(w)))
      else setFit(fitOf(w))
    }
    read(false)
    const ro = new ResizeObserver(() => read(true))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return { ref, fit }
}
