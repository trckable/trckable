// Cinema: while a replay is up the chart's block lifts out of the page into a stage over a dimmed page. Its place in the
// page is kept (a spacer of the same height), so nothing under it moves; leaving takes a moment, so it can fade.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Replay } from '../replay/useReplay'

/** The time of the way out, in ms (none for reduced motion: it is gone at once). */
const OUT_MS = 220

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export interface Lift {
  /** `in` while the replay is up, `out` while it fades away, null when the chart is in the page. */
  state: 'in' | 'out' | null
  /** What the block took in the page, held while it is lifted out. */
  slot: { h: number; mt: string } | null
}

/** The stage's state for a replay's phase, and the place the block leaves behind. `block`: the block that lifts. */
export function useCinema(phase: Replay['phase'], block: RefObject<HTMLElement | null>): Lift {
  const [shown, setShown] = useState(phase !== 'off')
  if (phase !== 'off' && !shown) setShown(true)
  useEffect(() => {
    if (phase !== 'off' || !shown) return
    const t = setTimeout(() => setShown(false), reduced() ? 0 : OUT_MS)
    return () => clearTimeout(t)
  }, [phase, shown])
  const [slot, setSlot] = useState<Lift['slot']>(null)
  const held = useRef(slot)
  useEffect(() => {
    held.current = slot
  })
  useEffect(() => {
    const el = block.current
    if (!el || shown) return
    const read = () => setSlot({ h: el.offsetHeight, mt: getComputedStyle(el).marginTop })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [block, shown])
  if (!shown) return { state: null, slot: null }
  return { state: phase === 'off' ? 'out' : 'in', slot }
}
