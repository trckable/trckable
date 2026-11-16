// The small marks of the Verified seal: the seal itself, and one per source.
// Brand colours live only in the tiny Google mark and the payment providers' logos (logos.ts); everything else
// takes the text colour.
import { BadgeCheck, Check, CreditCard } from 'lucide-react'
import type { VerifiedSource } from '../../lib/api'
import { logoOf, markStyle } from './logos'

export const Seal = ({ size = 15 }: { size?: number }) => <BadgeCheck size={size} strokeWidth={2} aria-hidden="true" />

export const Tick = ({ size = 12 }: { size?: number }) => <Check size={size} strokeWidth={2.5} aria-hidden="true" />

/** Google's G, in its four colours. */
export function GoogleG({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="#4285f4" d="M15.2 8.2c0-.5 0-.9-.1-1.3H8v2.5h4a3.5 3.5 0 0 1-1.5 2.3v1.9h2.4c1.4-1.3 2.3-3.2 2.3-5.4z" />
      <path fill="#34a853" d="M8 15.5c2 0 3.7-.7 4.9-1.8l-2.4-1.9c-.7.4-1.5.7-2.5.7a4.4 4.4 0 0 1-4.1-3H1.4v1.9A7.5 7.5 0 0 0 8 15.5z" />
      <path fill="#fbbc05" d="M3.9 9.5a4.5 4.5 0 0 1 0-3V4.6H1.4a7.5 7.5 0 0 0 0 6.8z" />
      <path fill="#ea4335" d="M8 3.5c1.1 0 2.1.4 2.9 1.1l2.1-2.1A7.5 7.5 0 0 0 1.4 4.6l2.5 1.9A4.5 4.5 0 0 1 8 3.5z" />
    </svg>
  )
}

/** A payment provider's logo, from the one file the share pictures draw too; nothing for one we have no logo of. */
export function ProviderLogo({ id, size = 14 }: { id: string; size?: number }) {
  const m = logoOf(id)
  if (!m) return null
  const st = markStyle(m)
  return (
    <svg className={`vf-logo${st.light ? ' vf-logo-ink-light' : ''}`} width={size} height={size} viewBox="0 0 24 24" fill={st.fill} aria-hidden="true">
      <path d={m.d} />
    </svg>
  )
}

/** The mark of one source: Google's G, the provider's logo, a card for a provider with none. */
export function SourceMark({ s, size = 14 }: { s: Pick<VerifiedSource, 'kind' | 'provider'>; size?: number }) {
  if (s.kind === 'gsc') return <GoogleG size={size} />
  if (s.provider && logoOf(s.provider)) return <ProviderLogo id={s.provider} size={size} />
  return <CreditCard size={size} strokeWidth={1.9} aria-hidden="true" />
}
