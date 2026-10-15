// What the Verified seal says, from the sources the server lists (the server
// decides what counts: server/internal/api/verified.go). Pure.
import type { Verified, VerifiedSource } from '../../lib/api'

/** Where a card's badge comes from: the Visitors number, the money, Google's own data. */
export type Slot = 'visitors' | 'revenue' | 'search'

const KIND: Record<Slot, VerifiedSource['kind']> = { visitors: 'snippet', revenue: 'payments', search: 'gsc' }

const NAMES: Record<string, string> = { stripe: 'Stripe', paypal: 'PayPal', paddle: 'Paddle', lemonsqueezy: 'Lemon Squeezy', polar: 'Polar', dodo: 'Dodo Payments', gumroad: 'Gumroad' }

/** The providers a Connect row offers first, in this order. */
const OFFERED = ['stripe', 'paypal', 'paddle', 'lemonsqueezy']

export const providerName = (id?: string) => (id ? (NAMES[id] ?? id) : '')

/** The sources that work right now: the ones that count. */
export const working = (v?: Verified): VerifiedSource[] => (v?.sources ?? []).filter((s) => s.ok)

/** The source that proves a card's number, when one works. */
export const proofFor = (v: Verified | undefined, slot: Slot): VerifiedSource | null => working(v).find((s) => s.kind === KIND[slot]) ?? null

/** The most recent look at any source, for "Last checked". */
export const lastChecked = (v?: Verified): number => Math.max(0, ...(v?.sources ?? []).map((s) => s.checked))

/** Payment providers not connected yet, for the one dashed Connect row. */
export function missingProviders(v?: Verified): string[] {
  const have = new Set((v?.sources ?? []).filter((s) => s.kind === 'payments').map((s) => s.provider))
  return OFFERED.filter((id) => !have.has(id)).map(providerName)
}

/** Whether any payment source is listed (working or not). */
export const hasPayments = (v?: Verified) => (v?.sources ?? []).some((s) => s.kind === 'payments')
