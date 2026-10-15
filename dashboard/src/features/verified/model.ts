// What the Verified seal says, from the sources the server lists (the server
// decides what counts: server/internal/api/verified.go). A badge is one
// independent third party vouching for the numbers, one per kind: Payments
// (Stripe, PayPal, Paddle, Lemon Squeezy, Polar, Dodo: any of them) and Search
// (Google Search Console). trckable's own snippet is no source. Pure.
import type { Verified, VerifiedSource } from '../../lib/api'

/** The kinds of badge there are. */
export type Kind = 'payments' | 'search'

/** Where a card's badge comes from: the money, Google's own data. */
export type Slot = 'revenue' | 'search'

export const KINDS: Kind[] = ['payments', 'search']

const KIND_OF: Record<Slot, VerifiedSource['kind']> = { revenue: 'payments', search: 'gsc' }
const SOURCE_KIND: Record<string, Kind | undefined> = { payments: 'payments', gsc: 'search' }

const NAMES: Record<string, string> = { stripe: 'Stripe', paypal: 'PayPal', paddle: 'Paddle', lemonsqueezy: 'Lemon Squeezy', polar: 'Polar', dodo: 'Dodo Payments', gumroad: 'Gumroad' }

export const providerName = (id?: string) => (id ? (NAMES[id] ?? id) : '')

/** The sources that work right now, one per kind: the ones that count. */
export function working(v?: Verified): VerifiedSource[] {
  const seen = new Set<Kind>()
  return (v?.sources ?? []).filter((s) => {
    const kind = SOURCE_KIND[s.kind]
    if (!s.ok || !kind || seen.has(kind)) return false
    seen.add(kind)
    return true
  })
}

/** The kinds of badge earned. */
export const earned = (v?: Verified): Kind[] => {
  const have = working(v).map((s) => SOURCE_KIND[s.kind])
  return KINDS.filter((k) => have.includes(k))
}

/** The kinds not earned yet: each gets a Connect row. */
export const missing = (v?: Verified): Kind[] => KINDS.filter((k) => !earned(v).includes(k))

/** The source that proves a card's number, when one works. */
export const proofFor = (v: Verified | undefined, slot: Slot): VerifiedSource | null => working(v).find((s) => s.kind === KIND_OF[slot]) ?? null

/** The most recent look at any source, for "Last checked". */
export const lastChecked = (v?: Verified): number => Math.max(0, ...(v?.sources ?? []).map((s) => s.checked))

/** The settings tab where a kind of badge is connected. */
export const tabOf = (k: Kind): 'payments' | 'search' => k
