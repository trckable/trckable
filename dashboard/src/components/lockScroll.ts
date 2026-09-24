// While a dialog is open the page behind it must stay put: scrolling the
// background under a modal loses your place and, on a phone, scrolls the wrong
// thing entirely. The scrollbar's width is added back as padding so nothing
// jumps sideways when it disappears.
import { useEffect } from 'react'

let depth = 0

export function useLockScroll(active = true) {
  useEffect(() => {
    if (!active) return
    const body = document.body
    const html = document.documentElement
    if (depth === 0) {
      // The page scrolls on <html>, so that is what has to stop; <body> gets
      // the scrollbar's width back as padding so nothing shifts sideways.
      const gap = window.innerWidth - html.clientWidth
      body.dataset.prevPad = body.style.paddingRight
      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      if (gap > 0) body.style.paddingRight = gap + 'px'
    }
    depth++
    return () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        html.style.overflow = ''
        body.style.overflow = ''
        body.style.paddingRight = body.dataset.prevPad ?? ''
        delete body.dataset.prevPad
      }
    }
  }, [active])
}

/** A dropdown on a phone opens centred over the page, like a dialog, so the
 *  page behind it must stay put too. On a wider screen it is anchored to its
 *  button and the page may scroll as usual. */
export function usePhoneLock(active = true) {
  useLockScroll(active && typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches)
}
