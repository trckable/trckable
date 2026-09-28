// Hover and keyboard for index charts: the pointer picks the nearest bucket,
// and with the chart focused the arrow keys walk through them (Home / End
// jump to the ends, Escape lets go), so every mark's numbers can be read
// without a mouse.
import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { nearestIndex } from './scale'

export function useHover(n: number, plotLeft: number, plotWidth: number) {
  const [i, setI] = useState<number | null>(null)
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setI(nearestIndex(e.clientX - box.left - plotLeft, plotWidth, n))
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, (c: number) => number> = {
      ArrowRight: (c) => Math.min(n - 1, c + 1),
      ArrowLeft: (c) => Math.max(0, c - 1),
      Home: () => 0,
      End: () => n - 1,
    }
    if (e.key === 'Escape') {
      setI(null)
      return
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    setI((c) => move(c ?? (e.key === 'ArrowLeft' ? n : -1)))
  }
  return {
    i,
    set: setI,
    handlers: { onPointerMove, onPointerLeave: () => setI(null), onKeyDown, onBlur: () => setI(null) },
  }
}
