// trckable/next — two lines for the most accurate setup:
//
//   // app/layout.tsx
//   import { Analytics } from 'trckable/next'
//   <Analytics site="tkb_…" />
//
//   // app/api/e/route.ts   (set TRCKABLE_HOST and TRCKABLE_PROXY_KEY)
//   export { POST } from 'trckable/next'
//
// First party, the neutral way (script and visits under your own paths):
//
//   // next.config.mjs
//   import { withTrckable } from 'trckable/next'
//   export default withTrckable({})          // serves /s/x.js from your trckable server
//
//   // app/s/e/route.ts
//   export { POST } from 'trckable/next'
//   // app/s/h/route.ts (heatmaps)
//   export { heatPost as POST } from 'trckable/next'
//
//   <Script src="/s/x.js" data-site="tkb_…" data-api="/s/e" defer />
//
// Server helper for checkout metadata:
//   import { cookies } from 'next/headers'
//   import { getIds } from 'trckable/next'
//   const ids = getIds(await cookies())
import { proxy } from './server'

export { Analytics } from './next-client'
export { proxy as createProxy, scriptProxy, getIds, clientIP, checkoutFields, checkoutUrl } from './server'
export type { ProxyOptions, TrckableIds, CheckoutProvider } from './server'
export type { AnalyticsProps } from './react'

/** Ready-made route handler for app/api/e/route.ts (or app/s/e/route.ts), configured from env. */
export const POST = proxy()

/** The same for heatmap reports: app/s/h/route.ts, `export { heatPost as POST } from 'trckable/next'`. */
export const heatPost = proxy({ target: 'heat' })

type Rewrite = { source: string; destination: string }
type Rewrites = Rewrite[] | { beforeFiles?: Rewrite[]; afterFiles?: Rewrite[]; fallback?: Rewrite[] }
type NextConfigLike = { rewrites?: () => Promise<Rewrites> | Rewrites; [key: string]: unknown }

export interface WithTrckableOptions {
  /** Your trckable server. Defaults to $TRCKABLE_HOST. */
  host?: string
  /** Path the script is served from on your domain. Default "/s/x.js". */
  script?: string
}

/**
 * Wraps next.config so your own domain serves the tracker script, fetched from
 * your trckable server. Everything else in the config, including rewrites you
 * already have, is kept.
 */
export function withTrckable<T extends NextConfigLike>(config: T = {} as T, options: WithTrckableOptions = {}): T {
  const host = (options.host ?? (typeof process !== 'undefined' ? process.env?.TRCKABLE_HOST : undefined))?.replace(/\/+$/, '')
  if (!host) return config
  const mine: Rewrite = { source: options.script ?? '/s/x.js', destination: host + '/js/t.js' }
  const previous = config.rewrites
  return {
    ...config,
    async rewrites() {
      const had = previous ? await previous() : []
      if (Array.isArray(had)) return [...had, mine]
      return { ...had, afterFiles: [...(had.afterFiles ?? []), mine] }
    },
  }
}
