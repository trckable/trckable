// One active row in a menu or list, like cmdk: the row under the mouse, or the one the arrow keys reached, never both.
// The mouse marks its row with data-act (the styles fill it, and clear the key's row while it is there); a key that moves focus onto a row clears the mark,
// so the key's row takes over again until the mouse moves.
import { useEffect } from 'react'

const ROWS = '.mk .mi, .mk .xmi, .mk .xri, .mk .nf'

export function useActiveRow() {
  useEffect(() => {
    let mark: Element | null = null
    const set = (row: Element | null) => {
      if (row === mark) return
      mark?.removeAttribute('data-act')
      row?.setAttribute('data-act', '')
      mark = row
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      set(e.target instanceof Element ? e.target.closest(ROWS) : null)
    }
    const key = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.matches(ROWS) && e.target.matches(':focus-visible')) set(null)
    }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('focusin', key)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('focusin', key)
      set(null)
    }
  }, [])
}
