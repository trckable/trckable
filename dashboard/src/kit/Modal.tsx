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

// The one overlay manager. Escape closes the dialog on top, not every open one at once, and only one dialog is
// ever in view: a dialog opened from another takes its place, and the one beneath comes back when it closes
// (the way back). A question about what is beneath (`over`: a confirmation) is the one thing that nests.
type Entry = { close: () => void; over: boolean; back: () => HTMLElement | null }
const stack: Entry[] = []
if (typeof document !== 'undefined')
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || stack.length === 0) return
    e.stopPropagation()
    stack[stack.length - 1].close()
  })

/** Everything below the topmost replacing dialog is put away: out of sight, out of reach. A sheet of the page (the
 *  Briefing's drawers) is put away too while a dialog is open: body[data-modal] says so to its styles. */
function settle() {
  const top = stack.map((s) => s.over).lastIndexOf(false)
  if (top === -1) delete document.body.dataset.modal
  else document.body.dataset.modal = ''
  stack.forEach((s, i) => {
    const el = s.back()
    if (!el) return
    if (i < top) {
      el.setAttribute('data-under', '')
      el.setAttribute('inert', '')
    } else {
      el.removeAttribute('data-under')
      el.removeAttribute('inert')
    }
  })
}

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

/** The dialog's last moment (a sheet's too, see useSheet): a copy of what was on screen fades and scales out
 *  over 160 ms, then goes. Not while React is only re-running the effect (the
 *  node is still in the page then) and not under reduced motion. */
export function leave(node: HTMLElement) {
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
  over = false,
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
  /** A question about the dialog beneath (a confirmation): it shows over it instead of replacing it. */
  over?: boolean
  children: ReactNode
}) {
  useLockScroll()
  const back = useRef<HTMLDivElement>(null)
  // The entry is pushed once, on mount, so a re-render of an outer dialog can
  // never jump it above the one that opened later.
  const latest = useRef(onClose)
  useLayoutEffect(() => {
    latest.current = onClose
  })
  useEffect(() => {
    const close = () => latest.current?.()
    const entry: Entry = { close, over, back: () => back.current }
    stack.push(entry)
    settle()
    const top = () => stack[stack.length - 1] === entry && close()
    const unhear = box.current ? hearFrames(box.current, top) : undefined
    return () => {
      unhear?.()
      const at = stack.lastIndexOf(entry)
      if (at !== -1) stack.splice(at, 1)
      settle()
    }
  }, [over])
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
