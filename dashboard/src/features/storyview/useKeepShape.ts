// Remembers how tall the story's boxes are, so the next refresh draws its boxes the same height (lib/bootCache.ts)
// and the numbers land without anything moving. Watches the story's own box; settles for a moment first.
import { useEffect, type RefObject } from 'react'
import { keepShape, type Shape } from '../../lib/bootCache'

const SETTLE_MS = 400

const height = (el: Element | null | undefined): number => Math.round(el?.getBoundingClientRect().height ?? 0)

/** The boxes' heights as they are now. */
export function shapeOf(root: Element): Shape {
  return {
    head: height(root.querySelector('.sv-head')),
    setup: height(root.querySelector('.sv-setup')),
    tile: height(root.querySelector('.sv-tiles .kit-card')),
    chart: height(root.querySelector('.sv-chart')),
    answers: [...root.querySelectorAll('.sv-answer')].slice(0, 5).map(height),
  }
}

export function useKeepShape(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const watch = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => keepShape(shapeOf(el)), SETTLE_MS)
    })
    watch.observe(el)
    return () => {
      watch.disconnect()
      clearTimeout(timer)
    }
  }, [root])
}
