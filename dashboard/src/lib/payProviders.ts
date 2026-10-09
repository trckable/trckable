// The providers the connect picker can offer, in one list: add a provider here
// and it is found by name and by keyword. Only shipped providers belong in it.
export type PayProvider = {
  id: string
  name: string
  keywords: string[]
  /** Not shipped yet: kept out of the picker. */
  soon: boolean
}

export const PAY_PROVIDERS: PayProvider[] = [
  { id: 'stripe', name: 'Stripe', keywords: ['card', 'cards', 'apple pay', 'google pay', 'payment links'], soon: false },
  { id: 'paddle', name: 'Paddle', keywords: ['card', 'cards', 'apple pay', 'google pay', 'merchant of record'], soon: false },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', keywords: ['lemon', 'merchant of record'], soon: false },
  { id: 'polar', name: 'Polar', keywords: ['open source', 'merchant of record'], soon: false },
  { id: 'dodo', name: 'Dodo Payments', keywords: ['dodo', 'merchant of record'], soon: false },
  { id: 'custom', name: 'Custom', keywords: ['webhook', 'other', 'anything else', 'own code'], soon: false },
]

/** The ones shown as tiles before anything is typed. */
export const MOST_USED = ['stripe', 'paddle', 'lemonsqueezy', 'polar']

const WALLETS = ['apple pay', 'google pay', 'card']

export type PayMatch = { hits: PayProvider[]; wallets: boolean }

/** The providers a search finds (name or keyword, any case), and whether it asked for a wallet or card, which come through the provider. No search finds nothing. */
export function findProviders(query: string, list: PayProvider[] = PAY_PROVIDERS): PayMatch {
  const q = query.trim().toLowerCase()
  if (!q) return { hits: [], wallets: false }
  const hits = list.filter((p) => !p.soon && [p.name, ...p.keywords].some((w) => w.toLowerCase().includes(q)))
  return { hits, wallets: q.length >= 3 && WALLETS.some((w) => w.includes(q)) }
}
