// New rows arriving in an open bell list never move what is being read.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { reducedMotion } from '../../lib/motion'
import type { BellRow } from './BellMenu'

const SLIDE_MS = 260

/** The box that scrolls the rows: the sheet's body on a phone, the list itself under the bell. */
const scroller = (list: HTMLElement): HTMLElement => list.closest<HTMLElement>('.cdb') ?? list

/** The first row in view, and how far from the top of the box it sits. */
function anchorOf(list: HTMLElement): { id: string; top: number } | null {
  const box = scroller(list).getBoundingClientRect()
  for (const w of list.querySelectorAll<HTMLElement>('.nfw')) {
    const r = w.getBoundingClientRect()
    if (r.bottom > box.top) return { id: w.dataset.id ?? '', top: r.top - box.top }
  }
  return null
}

/**
 * New rows arriving in an open list never move what is being read. Scrolled down, the list is scrolled by what came in
 * above, so the same row stays under the finger. At the top, the rows slide down into place on the compositor (the
 * layout has already moved; the transform puts every old row back where it was drawn, then lets go), and the new ones
 * fade in. With reduced motion there is the fade only.
 */
export function useArrival(list: RefObject<HTMLDivElement | null>, fresh: ReadonlySet<string>, rows: readonly BellRow[]) {
  const seen = useRef<{ id: string; top: number; scrolled: number } | null>(null)
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const box = scroller(el)
    const was = seen.current
    const items = [...el.querySelectorAll<HTMLElement>('.nfw')]
    const fresher = items.filter((w) => fresh.has(w.dataset.id ?? ''))
    if (fresher.length && was) {
      if (was.scrolled > 0) {
        const a = items.find((w) => w.dataset.id === was.id)
        if (a) box.scrollTop += a.getBoundingClientRect().top - box.getBoundingClientRect().top - was.top
      } else if (!reducedMotion() && typeof el.animate === 'function') {
        const first = items.find((w) => !fresh.has(w.dataset.id ?? ''))
        const lift = first ? first.offsetTop - items[0].offsetTop : 0
        if (lift > 0) for (const w of items) w.animate([{ transform: `translateY(${-lift}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'cubic-bezier(.2,.7,.2,1)' })
      }
    }
    if (typeof el.animate === 'function') for (const w of fresher) w.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: 'ease-out' })
    const a = anchorOf(el)
    seen.current = a && { ...a, scrolled: box.scrollTop }
  }, [list, fresh, rows])
  // Scrolling by hand moves the mark the next arrival is measured from.
  useEffect(() => {
    const el = list.current
    if (!el) return
    const box = scroller(el)
    const f = () => {
      const a = anchorOf(el)
      seen.current = a && { ...a, scrolled: box.scrollTop }
    }
    box.addEventListener('scroll', f, { passive: true })
    return () => box.removeEventListener('scroll', f)
  }, [list])
}
