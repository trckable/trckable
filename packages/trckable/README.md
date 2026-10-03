<div align="center">

<img src="https://raw.githubusercontent.com/trckable/trckable/main/.github/images/brand/mark.svg" width="72" height="72" alt="">

# trckable

**Privacy-first analytics. Free and open source.**

<a href="https://www.npmjs.com/package/trckable"><img src="https://img.shields.io/npm/v/trckable?style=flat-square&color=b8ff3c&label=npm" alt="npm version"></a> <!--f:badge_react--><a href="https://docs.trckable.com/benchmarks/"><img src="https://img.shields.io/badge/react_entry-2264_B_gzip-b8ff3c?style=flat-square" alt="trckable/react adds 2264 B gzip"></a><!--/f--> <a href="https://github.com/trckable/trckable/blob/main/packages/trckable/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0b0d10?style=flat-square" alt="MIT licence"></a>

[Docs](https://docs.trckable.com/install/npm/) · [GitHub](https://github.com/trckable/trckable) · [Changelog](https://github.com/trckable/trckable/blob/main/CHANGELOG.md) · [trckable.com](https://trckable.com)

<img src="https://raw.githubusercontent.com/trckable/trckable/main/.github/images/gallery/tour.webp" width="880" alt="A tour of the trckable dashboard on the demo site: the last 30 days against the 30 before, a pointer across the chart showing each day's visitors and revenue, the Share dialog, the money trail of visitors from Search, Full mode, then Replay playing the period day by day">

</div>

Tiny, free and open-source web analytics that shows which traffic pays. This is
the client (MIT) for a [trckable](https://github.com/trckable/trckable) server,
which is free and open source too (AGPL-3.0): run it yourself for free, or let
[trckable Cloud](https://cloud.trckable.com) host it for you. `host` points the
client at either.

- ~2 KB, bundled into your app (no script file for ad blockers to block)
- Pageviews for any SPA, goals, outbound links, downloads, scroll goals, engagement time
- Events that fail to send are kept in the browser, up to 24 hours and 200 events,
  and sent again oldest first as soon as the server answers (on a later page or
  visit, when the browser is back online, when the tab is shown, or after a pause
  that doubles up to about 4 minutes), each with the time it waited, so a visit
  made while your server was down is counted once, on the day it happened.
  Cookieless mode keeps nothing in the browser, so it tries again from memory
  while the page is open, and what is not delivered by then is lost
- The script runs once per page, however many copies load (the tag and the package, or two bundles)
- Cookieless mode stores nothing in the browser
- The visitor cookie `trckable_vid` holds a random id, which counts as personal data, and nothing else about the visitor. It lasts 400 days (7 days in Safari when the browser script sets it, 400 when your server route does). In the EU it normally needs consent first; cookieless mode sets none

Tracking needs no key: only the site's public id (`tkb_…`). The Next.js route
and other server proxies use the site's proxy key, kept on your server, and
`npx trckable mcp` a read-only API key.

## React (Vite, React Router, Remix…)

```tsx
import { Analytics } from 'trckable/react'

export default function App() {
  return (
    <>
      <Analytics site="tkb_a1b2c3d4" host="https://stats.example.com" />
      {/* your app */}
    </>
  )
}
```

## Next.js, the most accurate setup

```tsx
// app/layout.tsx
import { Analytics } from 'trckable/next'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics site="tkb_a1b2c3d4" />
      </body>
    </html>
  )
}
```

```ts
// app/api/e/route.ts
export { POST } from 'trckable/next'
```

Set `TRCKABLE_HOST` (your trckable server) and `TRCKABLE_PROXY_KEY` (Settings →
Install) in your environment. Events then go through your own domain:

- ad blockers can't tell them apart from your app's own requests
- Safari keeps the visitor cookie for 400 days instead of 7
- the visitor's Do Not Track and Global Privacy Control signals are passed on, so
  a site that honours them still does

Both variables are required. The proxy answers `500` with what to set when the
key is missing, because without it trckable cannot trust the visitor address you
forward and would see every visitor as your server: one visitor, one country.
`npx trckable doctor --host https://stats.example.com --proxy` checks the key (it
also runs when `TRCKABLE_PROXY_KEY` is set).

## Leave out your own visits

Open your site once in each browser you use, with `?trckable=ignore` on the end
of any address (`https://example.com/?trckable=ignore`). That browser is left out
of the counts from then on, through a proxy or not. `?trckable=track` puts it
back. The choice is kept in that browser's storage, so it does not work in
cookieless mode, which stores nothing. Settings → Data & privacy has both links.

## Landing page + app

A plain HTML landing page on `example.com` and a Next.js app on
`app.example.com`, with the same site id, count as one visitor and one
journey, and a sale made in the app is credited to whatever brought the
visitor to the landing page.

On the landing page, the script tag with `data-domain` set to your site's
domain:

```html
<script
  defer
  data-site="tkb_a1b2c3d4"
  data-domain="example.com"
  src="https://stats.example.com/js/tkb_a1b2c3d4.js">
</script>
```

In the app, the Next.js setup above, unchanged: `<Analytics site="tkb_a1b2c3d4" />`
and `export { POST } from 'trckable/next'` with `TRCKABLE_HOST` and
`TRCKABLE_PROXY_KEY`.

Why it works: the `trckable_vid` cookie lives on `example.com`, so both hosts
read the same one. The script writes it there because of `data-domain`; the
app's route has trckable set it from the server, on the site's domain whenever
the page is on it or a subdomain of it. Whichever the visitor opens first, the
other picks the cookie up, and the app's route renews it as a server cookie, so
Safari keeps it 400 days rather than 7.

Three things to get right:

- The site's domain in trckable is the parent domain (`example.com`, not
  `www.example.com`), and `data-domain` is that same domain.
- Leave out `data-domain` and the landing page's cookie stays on
  `example.com` only: the app never sees it and counts a second visitor.
- Checkout on either side attributes the sale: the script decorates hosted
  checkout links, and `getIds(await cookies())` in the app reads the same
  cookie for `checkoutFields()`.

## Goals

```ts
import { track } from 'trckable'

track('signup', { plan: 'pro' })
```

Or with no code at all:

```html
<button data-trckable-goal="signup" data-trckable-goal-plan="pro">Start trial</button>
<section data-trckable-scroll="saw_pricing">…</section>
```

## Any other server (Hono, SvelteKit, Astro, Remix, Workers, Bun, Deno)

```ts
import { proxy } from 'trckable/server'

const trckable = proxy({ host: 'https://stats.example.com', proxyKey: process.env.TRCKABLE_PROXY_KEY })
app.post('/api/e', (c) => trckable(c.req.raw)) // any (Request) => Response runtime
```

## AI assistants & crawlers

Robots do not run JavaScript, so the browser script never sees them. To see which AI assistants, training crawlers and search bots read which pages, report them from your server (opt-in: turn on the AI assistants & crawlers module first):

```ts
// Next.js middleware.ts — any server works the same way
import { reportCrawler } from 'trckable/server'

export function middleware(req: Request) {
  reportCrawler({
    host: process.env.TRCKABLE_HOST!,
    site: process.env.TRCKABLE_SITE!,
    key: process.env.TRCKABLE_PROXY_KEY,
    url: req.url,
    ua: req.headers.get('user-agent'),
  })
}
```

It never throws or blocks the response, and does nothing for people: only requests whose user agent looks like a robot are sent. trckable keeps a counter per day, robot and page; no IP, no cookie, no event. Robot hits never count as events.

## Revenue attribution

Connect your provider in the trckable dashboard (Settings → Payments), then pass the visitor to the checkout you create, so each sale (and every renewal) is credited to the visit that earned it:

```ts
import { getIds, checkoutFields } from 'trckable/server' // or 'trckable/next'

const ids = getIds(request.headers.get('cookie'))

// Stripe Checkout
await stripe.checkout.sessions.create({ ...params, ...checkoutFields('stripe', ids, 'subscription') }) // or 'payment'
// Lemon Squeezy
await createCheckout(storeId, variantId, { checkoutData: checkoutFields('lemonsqueezy', ids).checkout_data })
// Polar
await polar.checkouts.create({ products: [productId], ...checkoutFields('polar', ids) })
// Dodo Payments
await dodo.checkoutSessions.create({ ...params, ...checkoutFields('dodo', ids) })
```

Paddle.js runs in the browser: `Paddle.Checkout.open({ items, customData: { trckable_vid } })` with the `trckable_vid` cookie value.

Hosted checkout links (Stripe Payment Links, Lemon Squeezy, Polar and Dodo checkout links) need nothing: the browser script adds the visitor when they are clicked. For links you build on the server, use `checkoutUrl(url, ids)`.

## Ask your AI (MCP)

`npx trckable mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server, so any MCP-capable assistant can answer questions from your analytics. Create a key in your dashboard (your account → API keys). Keys are read-only.

```json
{
  "mcpServers": {
    "trckable": {
      "command": "npx",
      "args": ["-y", "trckable", "mcp"],
      "env": { "TRCKABLE_HOST": "https://stats.example.com", "TRCKABLE_API_KEY": "tkb_live_…" }
    }
  }
}
```

Tools: `trckable_sites`, `trckable_overview`, `trckable_sources`, `trckable_pages`, `trckable_audience`, `trckable_goals`, `trckable_revenue`, `trckable_realtime`, `trckable_milestones`. Dates follow each site's timezone; periods like `7d`, `mtd` or `lastmonth`, or exact `from`/`to` dates, with an optional comparison.

## Command line

```bash
npx trckable init --host https://stats.example.com --site tkb_a1b2c3d4   # shows what it would change; --yes writes it
npx trckable doctor --host https://stats.example.com --url https://example.com   # checks an install from the outside
npx trckable mcp                                                                  # the MCP server above
```

`init` recognises Next.js, React, SvelteKit, Astro, Nuxt and plain HTML, prints the full diff first, and never edits checkout or payment code. `doctor` only reads.

## Options

| Option | |
|---|---|
| `site` | Site id (`tkb_…`), required |
| `host` | Your trckable server. Omit it to use the same-origin route `/api/e` |
| `api` | Full events endpoint, if it's not `${host}/api/e` |
| `cookieless` | No cookie, nothing stored in the browser. Call `consent(true)` after consent to switch |
| `hash` | Count `#/routes` as pages |
| `dev` | Track on localhost, including automated browsers (Playwright, Cypress) |
| `domain` | Cookie domain, to share visitors across subdomains |

MIT licensed. The trckable server is AGPL-3.0.
