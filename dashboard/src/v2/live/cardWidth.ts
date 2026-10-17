import { useLayoutEffect, useState } from 'react'

export type Fit = 'tiny' | 'narrow' | 'wide'

/** How roomy Live's left card is: under 480 px the numbers shrink, under 560 px the bottom row is one column. */
export function fitOf(width: number): Fit {
  if (width < 480) return 'tiny'
  return width < 560 ? 'narrow' : 'wide'
}

/** The card's fit, followed as it is resized (the card is not always as wide as the screen). `ref` goes on the card; it may appear later than the first render. */
export function useFit<T extends HTMLElement>() {
  const [el, ref] = useState<T | null>(null)
  const [fit, setFit] = useState<Fit>('wide')
  useLayoutEffect(() => {
    if (!el) return
    const read = () => setFit(fitOf(el.getBoundingClientRect().width))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return { ref, fit }
}
