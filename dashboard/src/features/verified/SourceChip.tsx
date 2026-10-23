// The small badge in a card's head that names the independent source proving its number: Payments verified on the
// money, Search verified on Google's own data. It shows only while that source works.
import type { Verified } from '../../lib/api'
import { copy } from './copy'
import { SourceMark, Tick } from './Marks'
import { proofFor, type Slot } from './model'
import './verified.css'

const TEXT: Record<Slot, string> = { revenue: copy.badgeText.payments, search: copy.badgeText.search }

export function SourceChip({ verified, slot, compact }: { verified?: Verified; slot: Slot; compact?: boolean }) {
  const s = proofFor(verified, slot)
  if (!s) return null
  const text = TEXT[slot]
  // Compact: only the source's mark, its name in the tooltip.
  if (compact) {
    return (
      <span className="vf-mark" role="img" aria-label={copy.badge(text)} title={copy.badge(text)}>
        <SourceMark s={s} size={13} />
      </span>
    )
  }
  return (
    <span className="vf-chip" title={copy.badge(text)}>
      <SourceMark s={s} size={11} />
      <span>{text}</span>
      <Tick size={10} />
      <span className="sr">{copy.badge(text)}</span>
    </span>
  )
}

/** The mark a card of the Briefing wears when its number rests on a source: the money's pill, or Google's own small mark by the title. */
export function CardSeal({ verified, topic }: { verified?: Verified; topic: string }) {
  if (topic === 'sales') return <SourceChip verified={verified} slot="revenue" />
  return topic === 'search' ? <SourceChip verified={verified} slot="search" compact /> : null
}
