// Dragging a row of a list, by pointer, with the other rows sliding live into
// the place the row would take (FLIP: measure, re-render, then play each row
// from where it was to where it is, ~120 ms). The row under the pointer lifts
// and follows it; dropping saves, Esc puts everything back. The list is the
// DOM's (rows carry `data-<key>`), so the hook stays small and needs no drag
// library. What a place in the list means (the sites' layout, the accounts'
// order) is the caller's: `resolve` turns the pointer into the next arrangement.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

const START = 5 // px of movement before a press becomes a drag
const SETTLE = 130 // ms after a row moves before the next move is judged, so rows mid-slide cannot flip it back
const SLIDE = 120
const EDGE = 28 // px from the list's edge where it scrolls
const HOLD = 250 // ms held there before it does
const MAXSCROLL = 12 // px per frame at the very edge

interface Drag<S> {
  id: string
  preview: S
}
interface Press<S> {
  id: string
  y0: number
  grab: number // the pointer's distance below the row's top
  y: number
  active: boolean
  movedAt: number
  preview: S
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const tops = (list: HTMLElement, key: string) => new Map([...list.querySelectorAll<HTMLElement>(`[data-${key}]`)].map((li) => [li.dataset[key] ?? '', li.getBoundingClientRect().top]))
const rowOf = (list: HTMLElement, key: string, id: string) => list.querySelector<HTMLElement>(`[data-${key}="${CSS.escape(id)}"]`)

/** An element's top inside `box`'s scrolling content, however many positioned parents lie between. */
function topIn(box: HTMLElement, el: HTMLElement) {
  let y = 0
  for (let n: HTMLElement | null = el; n && n !== box; n = n.offsetParent as HTMLElement | null) y += n.offsetTop
  return y
}

/** A thin line at the slot the lifted row would land in (the slot is where its row sits in the list; the row itself follows the pointer). */
function dropLine(box: HTMLElement, row: HTMLElement | null) {
  let line = box.querySelector<HTMLElement>(':scope > .drop-line')
  if (!row) {
    line?.remove()
    return
  }
  if (!line) {
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative'
    line = document.createElement('div')
    line.className = 'drop-line'
    line.setAttribute('aria-hidden', 'true')
    line.style.cssText = 'position:absolute;height:2px;border-radius:1px;pointer-events:none;z-index:3;background:var(--mk-faint,var(--text-3,currentColor));opacity:.8'
    box.appendChild(line)
  }
  line.style.top = `${topIn(box, row) - 1}px`
  line.style.left = `${row.offsetLeft}px`
  line.style.width = `${row.offsetWidth}px`
}

export interface DragList<S> {
  /** The rows carry `data-<key>`. */
  key: string
  /** The arrangement now. */
  current: S
  /** The arrangement with row `id` moved to where the pointer (y) is, or null when it points nowhere. */
  resolve: (box: HTMLElement, id: string, y: number, preview: S) => S | null
  save: (next: S) => void
  list: RefObject<HTMLElement | null>
}

export function useDragList<S>({ key, current, resolve, save, list }: DragList<S>) {
  const [drag, setDrag] = useState<Drag<S> | null>(null)
  const press = useRef<Press<S> | null>(null)
  const flip = useRef<Map<string, number> | null>(null)
  const latest = useRef({ current, resolve, save })
  useEffect(() => {
    latest.current = { current, resolve, save }
  })
  const end = useRef<() => void>(() => {})

  /** The lifted row sits under the pointer, wherever the list has put its slot. */
  const follow = () => {
    const p = press.current
    const el = p?.active && list.current ? rowOf(list.current, key, p.id) : null
    if (!p || !el) return
    el.style.transform = ''
    el.style.transform = `translateY(${p.y - p.grab - el.getBoundingClientRect().top}px) scale(1.02)`
    dropLine(list.current as HTMLElement, el)
  }

  // Held near the list's edge it scrolls (faster the closer to the edge), even while the pointer rests. A pointer only passing the edge does nothing.
  const scroll = useRef(0)
  const edgeSince = useRef(0)
  const tick = (now: number) => {
    const p = press.current
    const box = list.current
    if (!p?.active || !box) return
    const r = box.getBoundingClientRect()
    const into = (d: number) => Math.min(EDGE, Math.max(0, d)) // how far into the edge zone
    const by = ((into(p.y - (r.bottom - EDGE)) - into(r.top + EDGE - p.y)) * MAXSCROLL) / EDGE
    if (by === 0) edgeSince.current = 0
    else if (edgeSince.current === 0) edgeSince.current = now
    else if (now - edgeSince.current > HOLD) {
      box.scrollBy(0, by)
      follow()
    }
    scroll.current = requestAnimationFrame(tick)
  }

  useLayoutEffect(() => {
    const box = list.current
    if (!box) return
    follow()
    const before = flip.current
    flip.current = null
    if (!before || reduced()) return
    for (const li of box.querySelectorAll<HTMLElement>(`[data-${key}]`)) {
      if (li.dataset[key] === press.current?.id && press.current?.active) continue
      li.getAnimations().forEach((a) => a.cancel())
      const was = before.get(li.dataset[key] ?? '')
      const by = was === undefined ? 0 : was - li.getBoundingClientRect().top
      if (Math.abs(by) > 0.5) li.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], { duration: SLIDE, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
    }
  })

  const move = (e: globalThis.PointerEvent) => {
    const p = press.current
    const box = list.current
    if (!p || !box) return
    p.y = e.clientY
    if (!p.active) {
      if (Math.abs(p.y - p.y0) < START) return
      p.active = true
      scroll.current = requestAnimationFrame(tick)
      setDrag({ id: p.id, preview: p.preview })
    }
    follow()
    if (performance.now() - p.movedAt < SETTLE) return
    const next = latest.current.resolve(box, p.id, p.y, p.preview)
    if (!next || JSON.stringify(next) === JSON.stringify(p.preview)) return
    flip.current = tops(box, key)
    p.preview = next
    p.movedAt = performance.now()
    setDrag({ id: p.id, preview: next })
  }

  const finish = (commit: boolean) => {
    const p = press.current
    const box = list.current
    press.current = null
    cancelAnimationFrame(scroll.current)
    end.current()
    if (!p?.active || !box) return
    dropLine(box, null)
    const el = rowOf(box, key, p.id)
    flip.current = tops(box, key) // the lifted row glides from under the pointer into its slot
    if (el) el.style.transform = ''
    if (commit) latest.current.save(p.preview)
    setDrag(null)
    // What follows the drag (a click on the row) is not a pick.
    const swallow = (e: Event) => e.stopPropagation()
    document.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0)
  }

  useEffect(() => () => end.current(), [])

  const grab = (e: PointerEvent<HTMLElement>, id: string) => {
    const target = e.target as Element
    // The whole row is the handle for a mouse; on touch only the grip is, so the list still scrolls under a finger.
    if (e.button !== 0 || press.current || target.closest('[data-nodrag], .site-acts, input') || (e.pointerType === 'touch' && !target.closest('.grip'))) return
    const r = e.currentTarget.getBoundingClientRect()
    press.current = { id, y0: e.clientY, y: e.clientY, grab: e.clientY - r.top, active: false, movedAt: 0, preview: latest.current.current }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const esc = (k: KeyboardEvent) => {
      if (k.key !== 'Escape') return
      k.stopPropagation() // the switcher stays open; the row goes back
      finish(false)
      // The button is still down: the click that follows its release is not a pick either.
      document.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true })
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', esc, true) // before a menu's own Escape
    end.current = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', esc, true)
      end.current = () => {}
    }
  }

  return { id: drag?.id ?? null, preview: drag?.preview ?? null, grab }
}
