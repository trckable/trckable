// The small badge in a card's head that names the source proving its number:
// Live (the snippet) on Visitors, the provider on the money, Search Console on
// Google's own data. It shows only while that source works.
import type { Verified, VerifiedSource } from '../../lib/api'
import { copy } from './copy'
import { SourceMark, Tick } from './Marks'
import { proofFor, providerName, type Slot } from './model'
import './verified.css'

/** What a source's badge says. */
export function chipText(s: VerifiedSource): string {
  if (s.kind === 'snippet') return copy.live
  if (s.kind === 'gsc') return copy.searchConsole
  return providerName(s.provider)
}

export function SourceChip({ verified, slot }: { verified?: Verified; slot: Slot }) {
  const s = proofFor(verified, slot)
  if (!s) return null
  const text = chipText(s)
  return (
    <span className="vf-chip" title={copy.badge(text)}>
      <SourceMark s={s} size={11} />
      <span>{text}</span>
      <Tick size={10} />
      <span className="sr">{copy.badge(text)}</span>
    </span>
  )
}
