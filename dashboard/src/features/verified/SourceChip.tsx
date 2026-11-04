// The small badge in a card's head that names the independent source proving its number: Payments verified on the
// money, Search verified on Google's own data. It shows only while that source works.
import type { Verified } from '../../lib/api'
import { copy } from './copy'
import { SourceMark } from './Marks'
import { proofFor, type Slot } from './model'
import './verified.css'

const TEXT: Record<Slot, string> = { revenue: copy.badgeText.payments, search: copy.badgeText.search }

export function SourceChip({ verified, slot }: { verified?: Verified; slot: Slot }) {
  const s = proofFor(verified, slot)
  if (!s) return null
  // Only the source's mark; its name is in the tooltip.
  const label = copy.badge(TEXT[slot])
  return (
    <span className="vf-mark" role="img" aria-label={label} title={label}>
      <SourceMark s={s} size={13} />
    </span>
  )
}
