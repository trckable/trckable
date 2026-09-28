// Gives every card of the Full grid its span for four and for two columns
// (CSS picks one per screen width). The cards come from several places, some
// load late and some drop out, so this watches the grid rather than being
// told: a card asks for a width with data-w (default 2), and sections inside
// the grid only group cards (display: contents), so their children count.
import { useLayoutEffect, useRef } from 'react'
import { packRows } from './layout'

function cells(el: Element): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const c of el.children) {
    if (!(c instanceof HTMLElement)) continue
    if (c.dataset.group !== undefined) out.push(...cells(c))
    else out.push(c)
  }
  return out
}

function apply(items: HTMLElement[]) {
  const wants = items.map((c) => Number(c.dataset.w ?? 2))
  const four = packRows(wants, 4)
  const two = packRows(wants, 2)
  items.forEach((c, i) => {
    c.style.setProperty('--s4', String(four.spans[i]))
    c.style.setProperty('--o4', String(four.order[i]))
    c.style.setProperty('--s2', String(two.spans[i]))
    c.style.setProperty('--o2', String(two.order[i]))
  })
}

export function useGridLayout<T extends HTMLElement>(on: boolean) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const grid = ref.current
    if (!on || !grid) return
    // A hover redraws inside a card all the time: only a card arriving or
    // leaving changes the rows.
    let last: HTMLElement[] = []
    const update = () => {
      const now = cells(grid)
      if (now.length === last.length && now.every((c, i) => c === last[i])) return
      last = now
      apply(now)
    }
    update()
    const watch = new MutationObserver(update)
    watch.observe(grid, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [on])
  return ref
}
