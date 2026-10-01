// A dialog that changes shape while open (a tab, a step, a list that arrives)
// eases from its old height to the new one. It always ends at its content's
// own height: it never keeps the tallest tab's height behind a shorter one,
// which left an empty block under the buttons.
import { useLayoutEffect, type RefObject } from 'react'

const MS = 180

export function useGlide(box: RefObject<HTMLElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !on || typeof ResizeObserver === 'undefined') return
    let last = el.offsetHeight
    let moving = false
    let timer = 0
    const settle = () => {
      clearTimeout(timer)
      el.removeEventListener('transitionend', settle)
      el.style.transition = ''
      el.style.height = ''
      el.style.overflow = ''
      moving = false
      last = el.offsetHeight
    }
    const ro = new ResizeObserver(() => {
      if (moving) return
      const next = el.offsetHeight
      if (next === last) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        last = next
        return
      }
      moving = true
      // From the old height, held for one frame, to the new one.
      el.style.transition = 'none'
      el.style.overflow = 'hidden'
      el.style.height = `${last}px`
      el.getBoundingClientRect()
      el.style.transition = `height ${MS}ms ease`
      el.style.height = `${next}px`
      el.addEventListener('transitionend', settle)
      timer = window.setTimeout(settle, MS + 60)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      settle()
    }
  }, [box, on])
}
