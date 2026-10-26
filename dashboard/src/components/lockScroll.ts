// While a dialog is open the page behind it must stay put: scrolling the
// background under a modal loses your place and, on a phone, scrolls the wrong
// thing entirely. The scrollbar's width is added back as padding so nothing
// jumps sideways when it disappears.
import { useEffect } from 'react'

let depth = 0
let savedY = 0
let savedOverflow = ''
let savedGutter = ''

/** A touch that starts where nothing can scroll (the backdrop, the page) must not drag the page behind: iOS Safari
 *  ignores overflow: hidden for it. A scrollable box inside a dialog still scrolls. */
function scrollsInside(from: EventTarget | null) {
  for (let el = from instanceof Element ? from : null; el && el !== document.documentElement; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY
    if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight) return true
  }
  return false
}
const holdTouch = (e: TouchEvent) => {
  if (!scrollsInside(e.target)) e.preventDefault()
}

export function useLockScroll(active = true) {
  useEffect(() => {
    if (!active) return
    const html = document.documentElement
    if (depth === 0) {
      // The page scrolls on <html>, so that is what has to stop. The scrollbar's lane stays (scrollbar-gutter), so
      // nothing shifts sideways. <body> stays as it is: hidden too, it would become a box of its own that the sticky
      // control line is stuck inside, and the line would scroll away with the page the moment a dialog opens.
      savedY = window.scrollY
      savedOverflow = html.style.overflow
      savedGutter = html.style.scrollbarGutter
      html.style.scrollbarGutter = 'stable'
      html.style.overflow = 'hidden'
      document.addEventListener('touchmove', holdTouch, { passive: false })
    }
    depth++
    return () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        document.removeEventListener('touchmove', holdTouch)
        html.style.overflow = savedOverflow
        html.style.scrollbarGutter = savedGutter
        if (window.scrollY !== savedY) window.scrollTo(0, savedY)
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
