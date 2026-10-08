// One "did you know" bubble beside the thing it is about. Small and self
// contained: it draws and places itself, and says what the person did with it
// (Got it or the cross: seen; Turn hints off: no more). It takes no focus and
// blocks nothing. Placed to the right of its target when there is room, else
// under it (above when the page ends there; when neither has room the page scrolls a little to make some), and on a phone always full width
// under or over it. Hidden, not dismissed, while its target is off screen.
import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Hint.css'

const GAP = 10
const EDGE = 8
const WIDTH = 300

interface At {
  left: number
  top: number
  width: number
}

/** Where the bubble goes for a target's box: beside it, else under it, else over it. */
export function placeHint(t: { top: number; bottom: number; left: number; right: number }, h: number, view: { w: number; h: number }): At | null {
  if (t.bottom < 0 || t.top > view.h || t.right < 0 || t.left > view.w) return null
  const phone = view.w <= 640
  const width = phone ? view.w - 2 * EDGE : Math.min(WIDTH, view.w - 2 * EDGE)
  const clampTop = (y: number) => Math.max(EDGE, Math.min(y, view.h - h - EDGE))
  if (!phone && view.w - t.right - GAP - EDGE >= width) return { left: t.right + GAP, top: clampTop(t.top), width }
  const left = phone ? EDGE : Math.max(EDGE, Math.min(t.left, view.w - width - EDGE))
  if (view.h - t.bottom - GAP - EDGE >= h) return { left, top: t.bottom + GAP, width }
  if (t.top - GAP - EDGE >= h) return { left, top: t.top - GAP - h, width }
  return { left, top: clampTop(t.bottom + GAP), width }
}

export function Hint({
  target,
  text,
  words,
  onSeen,
  onOff,
}: {
  target: HTMLElement
  text: string
  words: { title: string; seen: string; off: string; close: string }
  /** Got it, or the cross. */
  onSeen: () => void
  /** Turn hints off. */
  onOff: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<At | null>(null)
  const scrolled = useRef(false)
  const place = () => {
    const el = box.current
    if (!el) return
    const t = target.getBoundingClientRect()
    const view = { w: window.innerWidth, h: window.innerHeight }
    // The box's true height (offsetHeight rounds it, and a half pixel short leaves no room over the target).
    const h = el.getBoundingClientRect().height
    const next = placeHint(t, h, view)
    // No free room under or over the target (a tall stack of cards on a phone): scroll up just enough to make room over it, once.
    const over = next && next.top < t.bottom && next.top + h > t.top && next.left < t.right && next.left + next.width > t.left
    const need = h + GAP + EDGE - t.top
    if (over && need > 0 && window.scrollY > 0 && !scrolled.current) {
      scrolled.current = true
      window.scrollBy(0, -Math.min(Math.ceil(need) + 1, window.scrollY))
      return
    }
    // Only a new place is a new state: this runs after every render.
    setAt((was) => (was && next && was.left === next.left && was.top === next.top && was.width === next.width ? was : next))
  }
  useLayoutEffect(place)
  useEffect(() => {
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  })
  return createPortal(
    <div
      ref={box}
      className="hint"
      role="status"
      aria-label={words.title}
      style={at ? { left: at.left, top: at.top, width: at.width } : { visibility: 'hidden', width: WIDTH }}
    >
      <button type="button" className="hint-x" aria-label={words.close} onClick={onSeen}>
        <X size={14} aria-hidden="true" />
      </button>
      <b className="hint-title">{words.title}</b>
      <p className="hint-text">{text}</p>
      <div className="hint-act">
        <button type="button" className="btn primary hint-ok" onClick={onSeen}>
          {words.seen}
        </button>
        <button type="button" className="hint-off" onClick={onOff}>
          {words.off}
        </button>
      </div>
    </div>,
    document.body,
  )
}
