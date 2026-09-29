// Every dialog goes through here, and every dialog is rendered into <body>.
// Nesting is the reason: an ancestor that animates a transform becomes the
// containing block for position: fixed, so a wizard opened from inside the
// account dialog was trapped by it — the backdrop stopped covering the page
// and the wizard's own heading was clipped out of reach.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLockScroll } from './lockScroll'
import './Modal.css'

// Escape closes the dialog on top, not every open one at once.
const stack: (() => void)[] = []
if (typeof document !== 'undefined')
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || stack.length === 0) return
    e.stopPropagation()
    stack[stack.length - 1]()
  })

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'

/** What Tab can reach inside `box`, in order. */
function tabbable(box: HTMLElement) {
  return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.matches(':disabled') && el.tabIndex >= 0 && !el.closest('[hidden], [inert]') && el.getAttribute('type') !== 'hidden' && el.getClientRects().length > 0,
  )
}

/** Tab and Shift+Tab stay inside the dialog, moved by hand so no browser's own
 *  idea of what Tab reaches (Safari skips buttons) can walk out of it. Only
 *  for a key pressed inside this dialog's own box (a dialog opened from it, in
 *  its own portal, keeps its own trap). */
export function trapTab(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'target' | 'preventDefault'>, box: HTMLElement) {
  if (e.key !== 'Tab' || !box.contains(e.target as Node)) return
  e.preventDefault()
  const list = tabbable(box)
  if (list.length === 0) {
    box.focus()
    return
  }
  const at = list.indexOf(document.activeElement as HTMLElement)
  const step = e.shiftKey ? -1 : 1
  // Not in the list: a step lands on the first (or, backwards, the last).
  const outside = step === 1 ? -1 : list.length
  const from = at === -1 ? outside : at
  list[(from + step + list.length) % list.length].focus()
}

export function Modal({
  label,
  onClose,
  className = '',
  keepSize = true,
  children,
}: {
  label: string
  /** Never shrink while open (tabs, steps). Off for a dialog whose later
   *  step is meant to be shorter. */
  keepSize?: boolean
  /** Left out while the dialog must not be dismissed — mid-delete, say. */
  onClose?: () => void
  className?: string
  children: ReactNode
}) {
  useLockScroll()
  // The entry is pushed once, on mount, so a re-render of an outer dialog can
  // never jump it above the one that opened later.
  const latest = useRef(onClose)
  useLayoutEffect(() => {
    latest.current = onClose
  })
  useEffect(() => {
    const entry = () => latest.current?.()
    stack.push(entry)
    return () => {
      const at = stack.lastIndexOf(entry)
      if (at !== -1) stack.splice(at, 1)
    }
  }, [])
  // While it is open, a dialog never shrinks: switching a tab or a step keeps
  // its size, and only more content makes it grow. A dialog that jumped with
  // every tab felt broken. Capped by the screen, so a phone keyboard or a
  // smaller window still fits it.
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !keepSize) return
    let tallest = 0
    const hold = () => {
      const h = el.offsetHeight
      if (h > tallest) {
        tallest = h
        el.style.minHeight = `min(${h}px, calc(100dvh - 32px))`
      }
    }
    hold()
    const ro = new ResizeObserver(hold)
    ro.observe(el)
    return () => ro.disconnect()
  }, [keepSize])
  // Focus moves into the dialog when it opens (unless a field in it already
  // took it) and back to what had it when it closes.
  useEffect(() => {
    const el = box.current
    const before = document.activeElement as HTMLElement | null
    if (el && !el.contains(document.activeElement)) (tabbable(el)[0] ?? el).focus()
    return () => {
      if (before && before.isConnected) before.focus()
    }
  }, [])
  return createPortal(
    // Escape is handled above, through the stack; a click on the backdrop is the mouse's way.
    <div className="modal-back" role="presentation" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- only stops a click inside the dialog from reaching the backdrop (and the page behind the portal) */}
      <div ref={box} tabIndex={-1} className={('modal rise ' + className).trim()} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => box.current && trapTab(e, box.current)}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
