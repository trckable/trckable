// A small card that slides in from the side, for a nudge: a title, a body, its
// actions and a close. It floats above the page (bottom
// right above the Peek button; a bottom sheet on a phone), so it never moves
// the layout. One at a time (useSideCard). Escape or the close puts it away;
// focus is not taken from what the person is doing, and goes back where it was
// when the card is closed from inside. Reduced motion: it just appears.
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSideCard } from './useSideCard'
import './SideCard.css'

export interface SideCardProps {
  /** Tells the slot apart from other cards. */
  id: string
  /** The card's name for assistive tech. */
  label: string
  /** The close button's name (the caller's words). */
  closeLabel: string
  title: string
  onClose: () => void
  actions: ReactNode
  children?: ReactNode
}

export function SideCard({ id, label, closeLabel, title, onClose, actions, children }: SideCardProps) {
  const mine = useSideCard(id)
  const card = useRef<HTMLElement>(null)
  const before = useRef<Element | null>(null)
  useEffect(() => {
    if (!mine) return
    const el = card.current
    const keep = (e: FocusEvent) => {
      if (!before.current && e.relatedTarget instanceof Element && !el?.contains(e.relatedTarget)) before.current = e.relatedTarget
    }
    el?.addEventListener('focusin', keep)
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Only when nothing else has the keyboard: the card itself, or the page.
      if (el?.contains(document.activeElement) || document.activeElement === document.body) onClose()
    }
    document.addEventListener('keydown', key)
    return () => {
      el?.removeEventListener('focusin', keep)
      document.removeEventListener('keydown', key)
      if (el?.contains(document.activeElement) && before.current instanceof HTMLElement && before.current.isConnected) before.current.focus()
    }
  }, [mine, onClose])
  if (!mine) return null
  return createPortal(
    <aside ref={card} className="side-card" aria-label={label}>
      <button type="button" className="side-card-x" aria-label={closeLabel} onClick={onClose}>
        <X size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <b className="side-card-title">{title}</b>
      {children}
      <div className="side-card-actions">{actions}</div>
    </aside>,
    document.body,
  )
}
