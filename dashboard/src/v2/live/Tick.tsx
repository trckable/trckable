import { fmtInt } from '../../lib/format'
import { useTween } from '../../lib/motion'

/** A figure that counts to its new value instead of swapping (at once with reduced motion). It starts at its value: nothing moves on first load. */
export function Tick({ n }: { n: number }) {
  return <>{fmtInt(Math.round(useTween(n, 400)))}</>
}
