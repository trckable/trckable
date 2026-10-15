// The kit's tooltip: one box that follows the mark under the pointer (or the
// keyboard), kept fully inside the chart by its measured size, so it never
// spills off a card or a phone screen and never covers the mark.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { placeTip } from './plot'
import './Tip.css'

export interface TipAt {
  x: number // px inside the chart's box
  y: number
  body: ReactNode
}

export function Tip({ at, width }: { at: TipAt | null; width: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ tw: 0, th: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const tw = el.offsetWidth
    const th = el.offsetHeight
    const h = el.offsetParent?.clientHeight ?? 0
    setBox((b) => (b.tw === tw && b.th === th && b.h === h ? b : { tw, th, h }))
  }, [at, width])
  if (!at) return null
  const pos = placeTip(at.x, at.y, box.tw, box.th, width, box.h || Infinity)
  return (
    <div ref={ref} className="chart-tip kit-tip" style={pos} role="status" aria-live="polite">
      {at.body}
    </div>
  )
}
