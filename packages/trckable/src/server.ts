// trckable/server — runs anywhere with the standard Request/Response API:
// Next.js route handlers, Remix/React Router, Hono, SvelteKit, Astro, Nuxt
// (h3 toWebRequest), Cloudflare Workers, Bun, Deno, Node 18+.

export interface ProxyOptions {
  /** Your trckable server, e.g. "https://stats.example.com". Defaults to $TRCKABLE_HOST. */
  host?: string
  /**
   * The site's proxy key (Settings → Install, "tkb_px_…"). Defaults to
   * $TRCKABLE_PROXY_KEY. With it, trckable trusts the visitor IP this proxy
   * forwards and sets the visitor cookie server-side.
   */
  proxyKey?: string
}

const env = (k: string): string | undefined =>
  typeof process !== 'undefined' ? process.env?.[k] : undefined

/**
 * A same-origin proxy for tracking events. Mount it at /api/e:
 *
 *   // app/api/e/route.ts (Next.js)
 *   export { POST } from 'trckable/next'
 *
 *   // Hono
 *   app.post('/api/e', (c) => trckableProxy(c.req.raw))
 */
export function proxy(options: ProxyOptions = {}): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const host = (options.host ?? env('TRCKABLE_HOST'))?.replace(/\/+$/, '')
    if (!host) return new Response('trckable: set TRCKABLE_HOST or pass { host }', { status: 500 })
    if (req.method !== 'POST') return new Response(null, { status: 405 })

    const key = options.proxyKey ?? env('TRCKABLE_PROXY_KEY')
    const ip = clientIP(req.headers)
    const headers: Record<string, string> = {
      'content-type': 'text/plain',
      'user-agent': req.headers.get('user-agent') ?? '',
    }
    if (key) headers['x-trckable-proxy-key'] = key
    if (key && ip) headers['x-trckable-client-ip'] = ip

    let res: Response
    try {
      res = await fetch(host + '/api/e', { method: 'POST', headers, body: await req.text() })
    } catch {
      // trckable unreachable (e.g. redeploying): 503 makes the tracker retry later.
      return new Response(null, { status: 503, headers: { 'retry-after': '5' } })
    }
    const out = new Response(null, { status: res.status })
    for (const h of ['set-cookie', 'retry-after']) {
      const v = res.headers.get(h)
      if (v) out.headers.set(h, v)
    }
    return out
  }
}

/**
 * The visitor's IP as set by the platform in front of your app. Each of these
 * headers is overwritten by its platform's edge, so visitors cannot forge them
 * there. Behind your own reverse proxy, make sure it sets X-Real-IP.
 */
export function clientIP(h: Headers): string | undefined {
  for (const name of ['cf-connecting-ip', 'x-nf-client-connection-ip', 'fly-client-ip', 'x-real-ip']) {
    const v = h.get(name)?.trim()
    if (v) return v
  }
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined // Vercel and most PaaS
}

export interface TrckableIds {
  /** Visitor id; pass it to your checkout's metadata to attribute revenue. */
  trckable_vid?: string
}

/**
 * Reads trckable's ids from a request's cookies, for checkout metadata:
 *
 *   const ids = getIds(req.headers.get('cookie'))
 *   stripe.checkout.sessions.create({ metadata: { ...ids }, subscription_data: { metadata: { ...ids } } })
 */
export function getIds(cookies: string | null | undefined | { get(name: string): { value: string } | undefined }): TrckableIds {
  if (!cookies) return {}
  if (typeof cookies !== 'string') {
    const v = cookies.get('trckable_vid')?.value
    return v ? { trckable_vid: v } : {}
  }
  const m = cookies.match(/(?:^|;\s*)trckable_vid=([^;]+)/)
  return m ? { trckable_vid: decodeURIComponent(m[1]) } : {}
}

export type CheckoutProvider = 'stripe' | 'lemonsqueezy' | 'polar' | 'paddle' | 'dodo'

/**
 * Fields to spread into a checkout you create on the server, so trckable
 * attributes the sale (and, for subscriptions, every renewal) to the visit
 * that earned it:
 *
 *   const ids = getIds(req.headers.get('cookie'))
 *   stripe.checkout.sessions.create({ ...params, ...checkoutFields('stripe', ids, 'subscription') })
 *   lemonSqueezy createCheckout(store, variant, { checkoutData: checkoutFields('lemonsqueezy', ids).checkout_data })
 *   polar.checkouts.create({ ...params, ...checkoutFields('polar', ids) })
 *   Paddle.Checkout.open({ items, customData: checkoutFields('paddle', ids).custom_data })
 *   dodo.checkoutSessions.create({ ...params, ...checkoutFields('dodo', ids) })
 */
export function checkoutFields(provider: CheckoutProvider, ids: TrckableIds, stripeMode: 'payment' | 'subscription' = 'payment'): Record<string, unknown> {
  if (!ids.trckable_vid) return {}
  const meta = { trckable_vid: ids.trckable_vid }
  switch (provider) {
    case 'stripe':
      // Checkout metadata reaches trckable on completion; the PaymentIntent or
      // subscription copy keeps renewals and later refunds attributed too.
      return stripeMode === 'subscription' ? { metadata: meta, subscription_data: { metadata: meta } } : { metadata: meta, payment_intent_data: { metadata: meta } }
    case 'lemonsqueezy':
      return { checkout_data: { custom: meta } }
    case 'paddle':
      return { custom_data: meta }
    default: // polar, dodo
      return { metadata: meta }
  }
}

/**
 * Adds the visitor id to a hosted checkout link (Stripe Payment Links, Lemon
 * Squeezy, Polar and Dodo checkout links). The browser script does this
 * automatically on click; use this when you build links on the server.
 */
export function checkoutUrl(url: string, ids: TrckableIds): string {
  const v = ids.trckable_vid
  if (!v) return url
  const u = new URL(url)
  const m = /(buy\.stripe|lemonsqueezy|polar|dodopayments)\.(com|sh)$/.exec(u.host)
  if (!m) return url
  const k = ({ b: 'client_reference_id', p: 'reference_id', l: 'checkout[custom][trckable_vid]', d: 'metadata_trckable_vid' } as Record<string, string>)[m[1][0]]
  if (!u.searchParams.has(k)) u.searchParams.set(k, 'trckable_' + v.replace('.', '_'))
  return u.href
}

/** What a crawler asked for. Everything here is about the robot, not a person. */
export interface CrawlerHit {
  /** Where trckable lives, e.g. https://stats.example.com */
  host: string
  /** The site id (tkb_…) */
  site: string
  /** The site's proxy key, so nobody else can invent robot traffic */
  key: string | undefined
  /** The URL that was requested */
  url: string
  /** The robot's user agent; nothing is recorded without one */
  ua: string | null | undefined
  /** The status you answered with, so error crawls stand out */
  status?: number
}

/**
 * Tell trckable that a robot asked for a page.
 *
 * Crawlers do not run JavaScript, so the browser script never sees them: this
 * is the only honest way to count AI assistants, search indexers and training
 * crawlers. Call it from a middleware and forget about it — it never throws,
 * never blocks the response, and sends nothing about the person browsing.
 *
 *     // Next.js middleware.ts
 *     export function middleware(req: Request) {
 *       reportCrawler({
 *         host: process.env.TRCKABLE_HOST!,
 *         site: process.env.TRCKABLE_SITE!,
 *         key: process.env.TRCKABLE_PROXY_KEY,
 *         url: req.url,
 *         ua: req.headers.get('user-agent'),
 *       })
 *     }
 */
export function reportCrawler(hit: CrawlerHit): void {
  if (!hit.ua || !hit.key || !hit.host || !hit.site) return
  // A quick shape test first: most requests are people, and a fetch per
  // pageview would be silly.
  if (!/bot|crawl|spider|gptbot|claude|chatgpt|perplexity|ccbot|bytespider|slurp|bingbot|googlebot|applebot|amazonbot/i.test(hit.ua)) return
  try {
    void fetch(hit.host.replace(/\/$/, '') + '/api/crawl', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Trckable-Proxy-Key': hit.key },
      body: JSON.stringify({ s: hit.site, u: hit.url, ua: hit.ua, st: hit.status }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* reporting a robot must never break a page */
  }
}
