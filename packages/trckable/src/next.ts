// trckable/next — two lines for the most accurate setup:
//
//   // app/layout.tsx
//   import { Analytics } from 'trckable/next'
//   <Analytics site="tkb_…" />
//
//   // app/api/e/route.ts   (set TRCKABLE_HOST and TRCKABLE_PROXY_KEY)
//   export { POST } from 'trckable/next'
//
// Server helper for checkout metadata:
//   import { cookies } from 'next/headers'
//   import { getIds } from 'trckable/next'
//   const ids = getIds(await cookies())
import { proxy } from './server'

export { Analytics } from './next-client'
export { proxy as createProxy, getIds, clientIP, checkoutFields, checkoutUrl } from './server'
export type { ProxyOptions, TrckableIds, CheckoutProvider } from './server'
export type { AnalyticsProps } from './react'

/** Ready-made route handler for app/api/e/route.ts, configured from env. */
export const POST = proxy()
