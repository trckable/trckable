// A menu of the walkthrough: open or shut, shut by a press outside it and by Escape.
import { useCallback, useEffect, useState } from 'react'

export function useMenu() {
  const [open, setOpen] = useState(false)
  const [root, attach] = useState<HTMLDivElement | null>(null)
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => {
    if (!open) return
    // What a menu inside it opens (a popover, a dialog) lives at the end of the page: pressing there is still inside.
    const away = (e: PointerEvent) => !root?.contains(e.target as Node) && !(e.target as Element).closest?.('.anchored, .anchored-back, .modal-back') && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open, root])
  return { open, setOpen, attach, close, toggle: () => setOpen((o) => !o) }
}
