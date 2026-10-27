// The quiet line at the top of the sales card: the payment provider that vouches for its number.
import type { Verified } from '../../lib/api'
import { copy } from '../../features/verified/copy'
import { Tick } from '../../features/verified/Marks'
import { proofFor, providerName } from '../../features/verified/model'
import { copy as cardCopy } from '../briefing/cards.copy'

export function VerifiedWith({ verified }: { verified?: Verified }) {
  const s = proofFor(verified, 'revenue')
  if (!s) return null
  return (
    <span className="ic-vf" title={copy.badge(copy.badgeText.payments)}>
      <Tick size={12} />
      {cardCopy.verifiedWith(providerName(s.provider) || copy.names.payments)}
    </span>
  )
}
