import { fmtInt } from '../../lib/format'
import { RollingNumber } from '../../kit/RollingNumber'

/** A figure whose changed digits roll to the new ones, with no frame blank or reflowed; reduced motion only swaps. */
export function Tick({ n }: { n: number }) {
  return <RollingNumber value={Number.isFinite(n) ? n : 0} format={fmtInt} className="tick" />
}
