import { useState } from 'react'
import { fmtInt } from '../../lib/format'
import { reducedMotion, useTween } from '../../lib/motion'
import { rollOf } from './roll'

/** A figure that counts to its new value instead of swapping, and (with `pulse`) flashes the accent once. It starts at its value: nothing moves on first load, and reduced motion only swaps. */
export function Tick({ n, pulse }: { n: number; pulse?: boolean }) {
  const [seen, setSeen] = useState(n)
  const [beat, setBeat] = useState(0)
  // Worked out while rendering, so the pulse starts with the new value and never a frame late.
  if (seen !== n) {
    setSeen(n)
    if (rollOf(seen, n, reducedMotion()).pulse) setBeat((b) => b + 1)
  }
  const shown = Math.round(useTween(n, rollOf(n === seen ? n + 1 : seen, n, reducedMotion()).ms))
  return (
    <span key={beat} className={pulse && beat ? 'tick flash' : 'tick'}>
      {fmtInt(shown)}
    </span>
  )
}
