// A finger has no hover: on a phone, touching a chart pins its card and
// crosshair where the finger was, and a touch anywhere outside the chart lets
// it go. A mouse, and any wider screen, are unchanged (the card follows the
// pointer and goes when it leaves).
import { useEffect, useRef, type PointerEvent, type RefObject } from 'react'

const phone = () => window.matchMedia('(max-width: 640px)').matches

export function usePin(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const pinned = useRef(false)
  const shut = useRef(close)
  useEffect(() => {
    shut.current = close
  })
  useEffect(() => {
    if (!open) {
      pinned.current = false
      return
    }
    const away = (e: globalThis.PointerEvent) => {
      if (!pinned.current || ref.current?.contains(e.target as Node)) return
      pinned.current = false
      shut.current()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, ref])
  return {
    /** A touch or a pen went down on the chart: what it picks stays. */
    down: (e: PointerEvent) => {
      pinned.current = e.pointerType !== 'mouse' && phone()
    },
    /** The pointer left: a pinned card stays, a mouse's goes. */
    leave: (e: PointerEvent) => {
      if (!pinned.current || e.pointerType === 'mouse') close()
    },
  }
}
