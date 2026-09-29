// A small popover under its button, for a list of choices. It renders into the
// page body (a dialog or a scrolling card cannot clip it), takes focus when it
// opens and gives it back to the button when it closes, moves between its
// choices with the arrow keys, and on a phone is a sheet from the bottom edge
// with the page dimmed behind it.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePhoneLock } from './lockScroll'
import { trapTab } from './Modal'
import './AnchoredPop.css'

const NAV = '[data-nav]:not(:disabled)'
const phone = () => window.matchMedia('(max-width: 640px)').matches

export function AnchoredPop({
  anchor,
  label,
  className = '',
  onClose,
  children,
}: {
  anchor: RefObject<HTMLElement | null>
  label: string
  className?: string
  /** Called on every way out (Escape, a click outside, the page moving). */
  onClose: () => void
  /** Given `close`: leave and put focus back on the button. */
  children: (close: () => void) => ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const openedAt = useRef(0)
  const [sheet] = useState(phone)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  usePhoneLock()

  const close = () => {
    onClose()
    anchor.current?.focus()
  }
  const latest = useRef(close)
  useLayoutEffect(() => {
    latest.current = close
  })

  useLayoutEffect(() => {
    const el = box.current
    const btn = anchor.current
    if (!el || !btn || sheet) return
    const r = btn.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const below = window.innerHeight - r.bottom
    setAt({
      left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
      top: below < h + 16 ? Math.max(8, r.top - h - 6) : r.bottom + 6,
    })
  }, [anchor, sheet])

  // In first, on what the popover marks data-autofocus, else its first choice:
  // once it is placed (a hidden element takes no focus).
  const placed = sheet || at !== null
  useEffect(() => {
    const el = box.current
    if (!el || !placed) return
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(NAV)
    first?.focus({ preventScroll: true })
  }, [placed])

  useEffect(() => {
    openedAt.current = performance.now()
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchor.current?.contains(t) && !box.current?.contains(t)) onClose()
    }
    // Escape closes this alone: heard before the dialog underneath hears it.
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      latest.current()
    }
    // A phone's keyboard resizes the window; only a new width is a new layout.
    const width = window.innerWidth
    const resized = () => {
      if (window.innerWidth !== width) onClose()
    }
    // A scroll under an open popover moves its button: close rather than drift.
    // One already under way when it opened is not the reader moving the page.
    const scrolled = (e: Event) => {
      if (performance.now() - openedAt.current < 250) return
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    window.addEventListener('resize', resized)
    window.addEventListener('scroll', scrolled, true)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
      window.removeEventListener('resize', resized)
      window.removeEventListener('scroll', scrolled, true)
    }
  }, [anchor, onClose])

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = box.current
    if (!el) return
    trapTab(e, el)
    const inField = (e.target as HTMLElement).tagName === 'INPUT'
    const keep = e.key === 'Home' || e.key === 'End' ? !inField : e.key === 'ArrowDown' || e.key === 'ArrowUp'
    if (!keep) return
    e.preventDefault()
    const list = Array.from(el.querySelectorAll<HTMLElement>(NAV))
    const now = list.indexOf(document.activeElement as HTMLElement)
    const to = { ArrowDown: now + 1, ArrowUp: now - 1, Home: 0, End: list.length - 1 }[e.key] ?? now
    list[(to + list.length) % list.length]?.focus()
  }

  return createPortal(
    <>
      <div className="anchored-back" aria-hidden="true" />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys move between the choices inside it */}
      <div
        ref={box}
        className={('pop anchored ' + className).trim()}
        role="dialog"
        aria-label={label}
        style={at ? { left: at.left, top: at.top } : { visibility: sheet ? undefined : 'hidden' }}
        onKeyDown={keys}
      >
        {children(close)}
      </div>
    </>,
    document.body,
  )
}
