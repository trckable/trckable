// Every dialog goes through here, and every dialog is rendered into <body>.
// Nesting is the reason: an ancestor that animates a transform becomes the
// containing block for position: fixed, so a wizard opened from inside the
// account dialog was trapped by it — the backdrop stopped covering the page
// and the wizard's own heading was clipped out of reach.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useGlide } from '../components/glide'
import { useLockScroll } from '../components/lockScroll'
import './Modal.css'

// Escape closes the dialog on top, not every open one at once.
const stack: (() => void)[] = []
if (typeof document !== 'undefined')
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || stack.length === 0) return
    e.stopPropagation()
    stack[stack.length - 1]()
  })

/** Keys pressed while focus is inside a same-origin frame never reach this page's
 *  document: hear Escape there too. A frame from another origin cannot be reached
 *  (the browser keeps its keys), and is skipped. */
export function hearFrames(box: HTMLElement, onEscape: () => void) {
  const attached = new Map<Window, (e: globalThis.KeyboardEvent) => void>()
  const hear = (frame: HTMLIFrameElement) => {
    try {
      const win = frame.contentWindow
      if (!win || !frame.contentDocument || attached.has(win)) return
      const on = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onEscape()
      win.document.addEventListener('keydown', on)
      attached.set(win, on)
    } catch {
      // another origin: nothing to hear
    }
  }
  const all = () =>
    box.querySelectorAll('iframe').forEach((f) => {
      hear(f)
      f.addEventListener('load', () => hear(f))
    })
  all()
  const seen = new MutationObserver(all)
  seen.observe(box, { childList: true, subtree: true })
  return () => {
    seen.disconnect()
    attached.forEach((on, win) => {
      try {
        win.document.removeEventListener('keydown', on)
      } catch {
        // the frame is gone
      }
    })
  }
}

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

/** The dialog's last moment: a copy of what was on screen fades and scales out
 *  over 160 ms, then goes. Not while React is only re-running the effect (the
 *  node is still in the page then) and not under reduced motion. */
function leave(node: HTMLElement) {
  if (node.isConnected || typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const ghost = node.cloneNode(true) as HTMLElement
  ghost.classList.add('leaving')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  ghost.querySelectorAll('[role=dialog]').forEach((d) => {
    d.removeAttribute('role')
    d.removeAttribute('aria-modal')
    d.removeAttribute('aria-label')
  })
  document.body.appendChild(ghost)
  setTimeout(() => ghost.remove(), 170)
}

export function Modal({
  label,
  onClose,
  className = '',
  keepSize = true,
  focus = 'first',
  children,
}: {
  label: string
  /** Ease from one height to the next while open (tabs, steps), instead of
   *  jumping. Off for a dialog that should follow its content at once. */
  keepSize?: boolean
  /** Left out while the dialog must not be dismissed — mid-delete, say. */
  onClose?: () => void
  /** Where focus lands when it opens: the first control, or the dialog itself
   *  (a window whose first control is a close button that should not glow). */
  focus?: 'first' | 'box'
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
    const top = () => stack[stack.length - 1] === entry && entry()
    const unhear = box.current ? hearFrames(box.current, top) : undefined
    return () => {
      unhear?.()
      const at = stack.lastIndexOf(entry)
      if (at !== -1) stack.splice(at, 1)
    }
  }, [])
  // While it is open, a dialog that changes shape (a tab, a step) eases to
  // its new height instead of jumping, and always ends at its content's own
  // height. A dialog that kept the tallest tab's height left an empty block
  // under its buttons on the shorter ones.
  const box = useRef<HTMLDivElement>(null)
  useGlide(box, keepSize)
  // Focus moves into the dialog when it opens (unless a field in it already
  // took it) and back to what had it when it closes. A help dot is never the
  // first stop: its tip would open by itself.
  // What had focus is noted while rendering, before any autoFocus in the
  // dialog's own content has moved it.
  const [before] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))
  useEffect(() => {
    const el = box.current
    if (el && !el.contains(document.activeElement)) (focus === 'first' ? tabbable(el).find((c) => !c.matches('.info-dot')) ?? el : el).focus()
    return () => {
      if (before && before.isConnected) before.focus()
    }
  }, [focus, before])
  // When the dialog goes, a copy of it stays for the length of its exit
  // animation and fades out. The copy is inert: no role, nothing to reach.
  const back = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = back.current
    return () => {
      if (el) leave(el)
    }
  }, [])
  return createPortal(
    // Escape is handled above, through the stack; a click on the backdrop is the mouse's way.
    <div ref={back} className="modal-back" role="presentation" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- only stops a click inside the dialog from reaching the backdrop (and the page behind the portal) */}
      <div ref={box} tabIndex={-1} className={('modal rise ' + className).trim()} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => box.current && trapTab(e, box.current)}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
