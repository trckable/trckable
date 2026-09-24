// Every dialog goes through here, and every dialog is rendered into <body>.
// Nesting is the reason: an ancestor that animates a transform becomes the
// containing block for position: fixed, so a wizard opened from inside the
// account dialog was trapped by it — the backdrop stopped covering the page
// and the wizard's own heading was clipped out of reach.
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLockScroll } from './lockScroll'

// Escape closes the dialog on top, not every open one at once.
const stack: (() => void)[] = []
if (typeof document !== 'undefined')
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || stack.length === 0) return
    e.stopPropagation()
    stack[stack.length - 1]()
  })

export function Modal({
  label,
  onClose,
  className = '',
  children,
}: {
  label: string
  /** Left out while the dialog must not be dismissed — mid-delete, say. */
  onClose?: () => void
  className?: string
  children: ReactNode
}) {
  useLockScroll()
  // The entry is pushed once, on mount, so a re-render of an outer dialog can
  // never jump it above the one that opened later.
  const latest = useRef(onClose)
  latest.current = onClose
  useEffect(() => {
    const entry = () => latest.current?.()
    stack.push(entry)
    return () => {
      const at = stack.lastIndexOf(entry)
      if (at !== -1) stack.splice(at, 1)
    }
  }, [])
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className={('modal rise ' + className).trim()} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
