// The small marks of the Verified seal: the seal itself, and one per source.
// Brand colours live only in the tiny Google and Stripe marks; everything else
// takes the text colour.
import { BadgeCheck, Check, CreditCard } from 'lucide-react'
import type { VerifiedSource } from '../../lib/api'

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

/** Stripe's S, white on its violet. */
export function StripeS({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect width="16" height="16" rx="4" fill="#635bff" />
      <path fill="#fff" d="M7.4 6.2c0-.4.3-.6.9-.6.8 0 1.7.3 2.4.7V4.2a6.3 6.3 0 0 0-2.4-.4c-2 0-3.3 1-3.3 2.7 0 2.7 3.7 2.2 3.7 3.4 0 .5-.4.6-1 .6-.9 0-1.9-.4-2.7-.8v2.2c.9.4 1.8.6 2.7.6 2 0 3.4-1 3.4-2.7 0-2.9-3.7-2.4-3.7-3.6z" />
    </svg>
  )
}

/** The mark of one source: Google's G, Stripe's S, a card for any other provider. */
export function SourceMark({ s, size = 14 }: { s: Pick<VerifiedSource, 'kind' | 'provider'>; size?: number }) {
  if (s.kind === 'gsc') return <GoogleG size={size} />
  return s.provider === 'stripe' ? <StripeS size={size} /> : <CreditCard size={size} strokeWidth={1.9} aria-hidden="true" />
}
