// A small panel anchored to its trigger, for choices or a few lines: opens on
// click (or on hover), closes on Escape, a click outside or the page moving,
// takes focus in and gives it back, arrow keys move between the choices, and on
// a phone it is a bottom sheet. The placement and keys are AnchoredPop's; this
// is the door every new panel goes through.
import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnchoredPop } from '../components/AnchoredPop'

export type PopTrigger = { ref: RefObject<HTMLButtonElement | null>; 'aria-expanded': boolean; 'aria-haspopup': 'dialog'; onClick: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void }

const LEAVE_MS = 150

export function Popover({ label, openOn = 'click', className, trigger, children }: { label: string; openOn?: 'click' | 'hover'; className?: string; trigger: (p: PopTrigger) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const close = useCallback(() => setOpen(false), [])
  const hold = () => clearTimeout(timer.current)
  const leave = () => {
    hold()
    timer.current = setTimeout(close, LEAVE_MS)
  }
  const hover = openOn === 'hover'
  return (
    <>
      {trigger({
        ref: anchor,
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        onClick: () => setOpen((o) => !o),
        onMouseEnter: hover
          ? () => {
              hold()
              setOpen(true)
            }
          : undefined,
        onMouseLeave: hover ? leave : undefined,
      })}
      {open && (
        <AnchoredPop anchor={anchor} label={label} className={className} onClose={close} onPointer={hover ? { enter: hold, leave } : undefined}>
          {children}
        </AnchoredPop>
      )}
    </>
  )
}
