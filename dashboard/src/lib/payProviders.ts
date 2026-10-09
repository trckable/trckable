// The providers the connect picker can offer, in one list: add a provider here
// and it is found by name and by keyword. Only shipped providers belong in it.
export type PayProvider = {
  id: string
  name: string
  keywords: string[]
  /** Not shipped yet: kept out of the picker. */
  soon: boolean
  /** No native integration: found by search only, and it opens the custom connection. */
  viaWebhook?: boolean
}

export const PAY_PROVIDERS: PayProvider[] = [
  { id: 'stripe', name: 'Stripe', keywords: ['card', 'cards', 'apple pay', 'google pay', 'links'], soon: false },
  { id: 'paddle', name: 'Paddle', keywords: ['card', 'cards', 'apple pay', 'google pay', 'merchant of record'], soon: false },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', keywords: ['lemon', 'merchant of record'], soon: false },
  { id: 'polar', name: 'Polar', keywords: ['open source', 'merchant of record'], soon: false },
  { id: 'dodo', name: 'Dodo Payments', keywords: ['dodo', 'merchant of record'], soon: false },
  { id: 'custom', name: 'Custom', keywords: ['webhook', 'other', 'anything else', 'own code'], soon: false },
]

const viaWebhook = (name: string, id = name.toLowerCase().replace(/[^a-z0-9]/g, '')): PayProvider => ({ id, name, keywords: [], soon: false, viaWebhook: true })

/** Common checkouts without a native integration yet. Found by search only, never tiles; each connects through the custom webhook. */
export const WEBHOOK_PROVIDERS: PayProvider[] = [
  'Shopify',
  'WooCommerce',
  'Gumroad',
  'PayPal',
  'Chargebee',
  'Recurly',
  'FastSpring',
  'Whop',
  'Braintree',
  'Square',
  'Mollie',
  'Adyen',
  'Razorpay',
  'Paystack',
  'Creem',
  'Payhip',
  'Ko-fi',
  'Patreon',
  'Memberstack',
  'Outseta',
  'Podia',
  'Teachable',
  'Kajabi',
  'ThriveCart',
  'SamCart',
  'Chargify (Maxio)',
].map((n) => viaWebhook(n))

/** The ones shown as tiles before anything is typed. */
export const MOST_USED = ['stripe', 'paddle', 'lemonsqueezy', 'polar']

/** How many checkouts a search can find, rounded down to tens: "30+". */
export function searchableCount() {
  const n = PAY_PROVIDERS.filter((p) => !p.soon && p.id !== 'custom').length + WEBHOOK_PROVIDERS.length
  return `${Math.floor(n / 10) * 10}+`
}

const WALLETS = ['apple pay', 'google pay', 'card']

export type PayMatch = { hits: PayProvider[]; wallets: boolean }

/** True when the text, or any word of it, starts with the query. */
const wordStart = (text: string, q: string) => {
  const t = text.toLowerCase()
  for (let i = 0; i < t.length; i++) if ((i === 0 || /[^a-z0-9]/.test(t[i - 1])) && t.startsWith(q, i)) return true
  return false
}

/**
 * The providers a search finds, any case: a word of the name, or a keyword,
 * has to start with what was typed. Name matches come before keyword matches.
 * Wallets and cards come through the provider, so they get a hint. No search
 * finds nothing.
 */
export function findProviders(query: string, list: PayProvider[] = [...PAY_PROVIDERS, ...WEBHOOK_PROVIDERS]): PayMatch {
  const q = query.trim().toLowerCase()
  if (!q) return { hits: [], wallets: false }
  const open = list.filter((p) => !p.soon)
  const byName = open.filter((p) => wordStart(p.name, q))
  const byKeyword = open.filter((p) => !byName.includes(p) && p.keywords.some((k) => k.toLowerCase().startsWith(q)))
  return { hits: [...byName, ...byKeyword], wallets: q.length >= 3 && WALLETS.some((w) => w.includes(q)) }
}
