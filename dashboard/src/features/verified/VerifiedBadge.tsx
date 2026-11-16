// The badge by a section's title where its numbers come from a source that vouches for them: the source's logo,
// "Verified" and a green check. Shown only while the verified list (model.ts) says that source works, so a section
// never claims more than the seal does; on money only when ALL of it comes from that one provider (not mixed with
// typed-in revenue or a second provider), and only for a source whose logo we have.
import type { Verified } from '../../lib/api'
import { copy } from './copy'
import { GoogleG, ProviderLogo, Tick } from './Marks'
import { logoOf } from './logos'
import { proofFor, providerName, type Slot } from './model'
import './verified.css'

/** The id of the logo the section's badge draws, or null when no source works, it is mixed or it has no logo. */
export function badgeSource(v: Verified | undefined, slot: Slot): string | null {
  const s = proofFor(v, slot)
  if (!s || s.mixed) return null
  const id = s.kind === 'gsc' ? 'gsc' : (s.provider ?? '')
  return id === 'gsc' || logoOf(id) ? id : null
}

export function VerifiedBadge({ verified, slot }: { verified?: Verified; slot?: Slot }) {
  const id = slot ? badgeSource(verified, slot) : null
  if (!id) return null
  const name = id === 'gsc' ? 'Google Search Console' : providerName(id)
  const label = copy.badge(`${name}: ${copy.badgeWord}`)
  return (
    <span className="vf-badge" data-verified-source={id} role="img" aria-label={label} title={label}>
      {id === 'gsc' ? <GoogleG size={14} /> : <ProviderLogo id={id} />}
      <span className="vf-badge-word">{copy.badgeWord}</span>
      <span className="vf-badge-tick">
        <Tick size={10} />
      </span>
    </span>
  )
}
