// One layout pass for every word and mark drawn in the chart's plot: the moment label, the sources' pills, the
// mentions' pins, the usual band's name. Each says how much it matters (`data-lbl`, 1 first); they are measured and
// placed in that order, each where it is, else nudged up or sideways into a free slot, never over the line and never
// over another label or a moment's marker. One that finds no slot is put away and counted in a "+N" at the lane's end.
// Measured on the page, so it is right at any width; runs after each render, when the layer's chunks arrive and when
// the chart is resized. Pure geometry is in `place`: labelLayout.test.ts.
import { useEffect, useRef } from 'react'

export interface Box {
  l: number
  t: number
  r: number
  b: number
}

const PAD = 3

export const touches = (a: Box, b: Box, pad = PAD) => a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad

/** Whether the line passes through the box (sampled every few pixels along each stretch of it). */
export function crosses(a: Box, line: number[][], pad = PAD): boolean {
  const box = { l: a.l - pad, t: a.t - pad, r: a.r + pad, b: a.b + pad }
  for (let i = 0; i < line.length; i++) {
    const [x0, y0] = line[i]
    const [x1, y1] = line[Math.min(line.length - 1, i + 1)]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3))
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n
      const y = y0 + ((y1 - y0) * k) / n
      if (x >= box.l && x <= box.r && y >= box.t && y <= box.b) return true
    }
  }
  return false
}

export interface Item {
  box: Box
}

/** Where each label goes: [dx, dy] to move it by, or null for no room. Labels come most important first; `fixed` boxes never move. */
export function place(items: Item[], fixed: Box[], line: number[][], bounds: Box): ([number, number] | null)[] {
  const taken = [...fixed]
  return items.map(({ box }) => {
    const w = box.r - box.l
    const h = box.b - box.t
    for (const dy of [0, -(h + 2), -2 * (h + 2), -3 * (h + 2)]) {
      for (const dx of [0, w / 2, -w / 2, w, -w, w * 1.5, -w * 1.5, w * 2.5, -w * 2.5]) {
        const at = { l: box.l + dx, t: box.t + dy, r: box.r + dx, b: box.b + dy }
        if (at.l < bounds.l || at.r > bounds.r || at.t < bounds.t || at.b > bounds.b) continue
        if (crosses(at, line) || taken.some((o) => touches(at, o))) continue
        taken.push(at)
        return [dx, dy]
      }
    }
    return null
  })
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { l: r.left, t: r.top, r: r.right, b: r.bottom }
}

/** Where a label is by itself: where it is now, less what this pass moved it by (so nothing is moved back and forth under the pointer). */
const natural = (el: HTMLElement | SVGElement): Box => {
  const b = boxOf(el)
  const dx = Number(el.dataset.dx ?? 0)
  const dy = Number(el.dataset.dy ?? 0)
  return { l: b.l - dx, t: b.t - dy, r: b.r - dx, b: b.b - dy }
}

/** Measures what is in the plot and writes the result straight on the elements (a `translate`, or `data-hidden`). */
export function layout(root: HTMLElement, pts: number[][]) {
  const svg = root.querySelector<SVGSVGElement>('svg#chart')
  if (!svg || pts.length === 0) return
  // A label under the pointer or holding the focus stays: it may grow when lit, and moving it would take it from under the pointer.
  if (root.querySelector('[data-lbl]:hover, [data-lbl]:focus-within')) return
  const labels = [...root.querySelectorAll<HTMLElement | SVGElement>('[data-lbl]')].sort((a, b) => Number(a.dataset.lbl) - Number(b.dataset.lbl))
  const s = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  if (!vb.width || !vb.height) return
  const line = pts.map(([x, y]) => [s.left + (x * s.width) / vb.width, s.top + (y * s.height) / vb.height])
  const top = (root.querySelector('.chlay-in') ?? svg).getBoundingClientRect().top
  const bounds = { l: s.left, r: s.right, t: top, b: s.bottom - (24 * s.height) / vb.height }
  const fixed = [...root.querySelectorAll('.moment-mark, svg#chart text:not([data-lbl])')].map(boxOf).filter((b) => b.r > b.l)
  const shown = labels.filter((el) => boxOf(el).r > boxOf(el).l)
  const items = shown.map((el) => ({ box: natural(el) }))
  const spots = place(items, fixed, line, bounds)
  let hidden = 0
  shown.forEach((el, i) => {
    const spot = spots[i]
    // Whole pixels: a text measured twice differs in the last digits, and a label must not move for that.
    const [dx, dy] = spot ? [Math.round(spot[0]), Math.round(spot[1])] : [0, 0]
    if (Number(el.dataset.dx ?? 0) !== dx || Number(el.dataset.dy ?? 0) !== dy) {
      el.style.translate = dx || dy ? `${dx}px ${dy}px` : ''
      el.dataset.dx = String(dx)
      el.dataset.dy = String(dy)
    }
    if (!spot) hidden++
    if (el.hasAttribute('data-hidden') !== !spot) el.toggleAttribute('data-hidden', !spot)
  })
  const lane = root.querySelector('.chlay-in')
  if (!lane) return
  let more = lane.querySelector<HTMLElement>('[data-lbl-more]')
  if (!more && hidden) {
    more = document.createElement('span')
    more.className = 'lbl-more num'
    more.setAttribute('data-lbl-more', '')
    lane.appendChild(more)
  }
  if (!more) return
  more.hidden = hidden === 0
  more.textContent = `+${hidden}`
  if (!hidden) return
  // The count takes the first free place from the lane's right end inwards.
  const others = [...fixed, ...shown.filter((el) => !el.hasAttribute('data-hidden')).map(boxOf)]
  const lr = lane.getBoundingClientRect()
  const w = more.getBoundingClientRect().width
  more.style.right = 'auto'
  for (let x = lr.width - w - 4; x >= 0; x -= 6) {
    more.style.left = `${x}px`
    if (!others.some((o) => touches(boxOf(more), o))) return
  }
}

export function useLabelLayout(geo: { pts: number[][] }) {
  const live = useRef(geo)
  const again = useRef<() => void>(() => undefined)
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.chwrap')
    if (!root) return
    let id = 0
    const run = () => {
      cancelAnimationFrame(id)
      id = requestAnimationFrame(() => layout(root, live.current.pts))
    }
    again.current = run
    const lane = root.querySelector('.chlay-in')
    const mo = new MutationObserver(run)
    if (lane) mo.observe(lane, { childList: true, subtree: true })
    const ro = new ResizeObserver(run)
    ro.observe(root)
    return () => {
      cancelAnimationFrame(id)
      mo.disconnect()
      ro.disconnect()
    }
  }, [])
  // After every render the labels are measured again: what they sit by has moved.
  useEffect(() => {
    live.current = geo
    again.current()
  })
}
