// Dragging a site in the switcher, by pointer, with the other rows sliding
// live into the place the site would take (FLIP: measure, re-render, then
// play each row from where it was to where it is, ~120 ms). The row under
// the pointer lifts and follows it; dropping saves, Esc puts everything back.
// The list is the DOM's (rows are found by their data attributes), so the
// hook stays small and needs no drag library.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { Site, SiteLayout } from '../../lib/api'
import { moveTo, placeKey, type Place, type Section } from './layout'

const START = 5 // px of movement before a press becomes a drag
const SETTLE = 130 // ms after a row moves before the next move is judged, so rows mid-slide cannot flip it back
const SLIDE = 120
const EDGE = 28 // px from the list's edge where it scrolls

interface Drag {
  id: string
  preview: SiteLayout
}
interface Press {
  id: string
  y0: number
  grab: number // the pointer's distance below the row's top
  y: number
  active: boolean
  movedAt: number
  preview: SiteLayout
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const tops = (list: HTMLElement) => new Map([...list.querySelectorAll<HTMLElement>('li[data-site]')].map((li) => [li.dataset.site ?? '', li.getBoundingClientRect().top]))
const rowOf = (list: HTMLElement, id: string) => list.querySelector<HTMLElement>(`li[data-site="${CSS.escape(id)}"]`)

/** Where the pointer says the site goes: which place, and before which site (none: last there). */
function target(list: HTMLElement, id: string, y: number, places: Map<string, Place>, sections: Section[]): { place: Place; before?: string } | null {
  const inside = (el: Element) => {
    const r = el.getBoundingClientRect()
    return y >= r.top && y < r.bottom
  }
  const placeOf = (el: Element) => places.get(el.closest<HTMLElement>('[data-section]')?.dataset.section ?? '')
  for (const head of list.querySelectorAll('.site-head')) {
    const place = inside(head) && placeOf(head)
    if (place) return { place, before: sections.find((s) => placeKey(s.place) === placeKey(place))?.sites.find((s) => s.id !== id)?.id }
  }
  for (const li of list.querySelectorAll<HTMLElement>('li[data-site], li.sites-none')) {
    const place = li.dataset.site !== id && inside(li) && placeOf(li)
    if (!place) continue
    if (!li.dataset.site) return { place }
    const r = li.getBoundingClientRect()
    if (y <= r.top + r.height / 2) return { place, before: li.dataset.site }
    let next = li.nextElementSibling as HTMLElement | null
    if (next?.dataset.site === id) next = next.nextElementSibling as HTMLElement | null
    return { place, before: next?.dataset.site }
  }
  return null
}

export function useReorder(sites: Site[], layout: SiteLayout, sections: Section[], save: (l: SiteLayout) => void, list: RefObject<HTMLElement | null>) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const press = useRef<Press | null>(null)
  const flip = useRef<Map<string, number> | null>(null)
  const latest = useRef({ sites, layout, sections, save })
  useEffect(() => {
    latest.current = { sites, layout, sections, save }
  })
  const end = useRef<() => void>(() => {})

  /** The lifted row sits under the pointer, wherever the list has put its slot. */
  const follow = () => {
    const p = press.current
    const el = p?.active && list.current ? rowOf(list.current, p.id) : null
    if (!p || !el) return
    el.style.transform = ''
    el.style.transform = `translateY(${p.y - p.grab - el.getBoundingClientRect().top}px) scale(1.02)`
  }

  useLayoutEffect(() => {
    const box = list.current
    if (!box) return
    follow()
    const before = flip.current
    flip.current = null
    if (!before || reduced()) return
    for (const li of box.querySelectorAll<HTMLElement>('li[data-site]')) {
      if (li.dataset.site === press.current?.id && press.current?.active) continue
      li.getAnimations().forEach((a) => a.cancel())
      const was = before.get(li.dataset.site ?? '')
      const by = was === undefined ? 0 : was - li.getBoundingClientRect().top
      if (Math.abs(by) > 0.5) li.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], { duration: SLIDE, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
    }
  })

  const places = () => new Map(latest.current.sections.map((s) => [placeKey(s.place), s.place]))

  const move = (e: globalThis.PointerEvent) => {
    const p = press.current
    const box = list.current
    if (!p || !box) return
    p.y = e.clientY
    if (!p.active) {
      if (Math.abs(p.y - p.y0) < START) return
      p.active = true
      setDrag({ id: p.id, preview: p.preview })
    }
    const r = box.getBoundingClientRect()
    if (p.y < r.top + EDGE) box.scrollBy(0, -10)
    else if (p.y > r.bottom - EDGE) box.scrollBy(0, 10)
    follow()
    if (performance.now() - p.movedAt < SETTLE) return
    const to = target(box, p.id, p.y, places(), latest.current.sections)
    if (!to) return
    const next = moveTo(latest.current.sites, p.preview, p.id, to.place, to.before)
    if (JSON.stringify(next) === JSON.stringify(p.preview)) return
    flip.current = tops(box)
    p.preview = next
    p.movedAt = performance.now()
    setDrag({ id: p.id, preview: next })
  }

  const finish = (commit: boolean) => {
    const p = press.current
    const box = list.current
    press.current = null
    end.current()
    if (!p?.active || !box) return
    const el = rowOf(box, p.id)
    flip.current = tops(box) // the lifted row glides from under the pointer into its slot
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
    if (e.button !== 0 || e.pointerType === 'touch' || press.current || !target.closest('.site, .grip')) return
    const r = e.currentTarget.getBoundingClientRect()
    press.current = { id, y0: e.clientY, y: e.clientY, grab: e.clientY - r.top, active: false, movedAt: 0, preview: latest.current.layout }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (k: KeyboardEvent) => {
      if (k.key !== 'Escape') return
      k.stopPropagation() // the switcher stays open; the row goes back
      finish(false)
      // The button is still down: the click that follows its release is not a pick either.
      document.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true })
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', cancel)
    document.addEventListener('keydown', key, true)
    end.current = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
      document.removeEventListener('keydown', key, true)
      end.current = () => {}
    }
  }

  return { id: drag?.id ?? null, preview: drag?.preview ?? null, grab }
}
