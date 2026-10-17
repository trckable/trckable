// A menu or popover that hangs from its trigger is drawn on the page's top layer (a popover), so no card's overflow and no
// stacking context can clip it or cover it. It keeps its place (it follows the page when that scrolls) and is kept whole
// inside the window; a sheet that is fixed already (a phone's) is only lifted.
import { useLayoutEffect, type RefObject } from 'react'

const M = 8

/** Lifts `el` to the top layer, and returns what puts it back. */
export function liftToTop(el: HTMLElement): () => void {
  const sheet = getComputedStyle(el).position === 'fixed'
  const anchor = el.offsetParent as HTMLElement | null
  const r = el.getBoundingClientRect()
  const a = anchor?.getBoundingClientRect()
  const dx = r.left - (a?.left ?? 0)
  const dy = r.top - (a?.top ?? 0)
  el.setAttribute('popover', 'manual')
  try {
    el.showPopover()
  } catch {
    el.removeAttribute('popover')
    return () => {}
  }
  const place = () => {
    const ar = anchor?.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    el.style.maxHeight = `${vh - 2 * M}px`
    const w = el.offsetWidth
    const h = el.offsetHeight
    el.style.position = 'fixed'
    el.style.left = `${Math.max(M, Math.min((ar?.left ?? 0) + dx, vw - w - M))}px`
    el.style.top = `${Math.max(M, Math.min((ar?.top ?? 0) + dy, vh - h - M))}px`
  }
  if (!sheet) {
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
  }
  return () => {
    window.removeEventListener('scroll', place, true)
    window.removeEventListener('resize', place)
    try {
      el.hidePopover()
    } catch {
      // Already gone with its page.
    }
    el.removeAttribute('popover')
    for (const p of ['position', 'left', 'top', 'maxHeight'] as const) el.style[p] = ''
  }
}

/** The element is on the top layer for as long as it is mounted. */
export function useTopLayer(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => (ref.current ? liftToTop(ref.current) : undefined), [ref])
}

/** The element (always mounted, shown by a class) is on the top layer while `open`. */
export function useTopLayerWhen(open: boolean, ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => (open && ref.current ? liftToTop(ref.current) : undefined), [open, ref])
}
