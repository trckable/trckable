// The small badge in a card's head that names the independent source proving its number: Payments verified on the
// money, Search verified on Google's own data. It shows only while that source works.
import type { Verified } from '../../lib/api'
import { copy } from './copy'
import { SourceMark, Tick } from './Marks'
import { proofFor, type Slot } from './model'
import './verified.css'

const TEXT: Record<Slot, string> = { revenue: copy.badgeText.payments, search: copy.badgeText.search }

export function SourceChip({ verified, slot }: { verified?: Verified; slot: Slot }) {
  const s = proofFor(verified, slot)
  if (!s) return null
  const text = TEXT[slot]
  return (
    <span className="vf-chip" title={copy.badge(text)}>
      <SourceMark s={s} size={11} />
      <span>{text}</span>
      <Tick size={10} />
      <span className="sr">{copy.badge(text)}</span>
    </span>
  )
}
