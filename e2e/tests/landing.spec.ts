// One site in two places: a plain HTML landing page on example.com with the
// script tag, and a Next.js app on app.example.com with trckable/next (the
// package's init(), which <Analytics /> calls, plus its proxy() at /api/e).
// Real domain names come from a forward proxy (serve.mjs, PROXY_PORT), so the
// cookie rules under test are the browsers' own, in all three engines.
import { createHmac } from 'node:crypto'
import { expect, test, type APIRequestContext } from './fixtures'
import { API, TOKEN } from '../playwright.config'

type Ev = { seq: number; kind: string; path: string; visitor: string; session: string; channel?: string }

const auth = { Authorization: `Bearer ${TOKEN}` }
const PROXY = 'http://127.0.0.1:18302'

let site = ''
test.beforeAll(async ({ request }) => {
  site = (await (await request.get('/_site')).json()).site
})

async function events(request: APIRequestContext, prefix: string): Promise<Ev[]> {
  const r = await request.get(`${API}/api/v1/sites/${site}/events?limit=1000&path_prefix=${encodeURIComponent(prefix)}`, { headers: auth })
  expect(r.ok()).toBeTruthy()
  return ((await r.json()).events as Ev[]).sort((a, b) => a.seq - b.seq)
}

/** Reports a sale the way any shop can: a signed custom webhook. */
async function sell(request: APIRequestContext, visitor: string, id: string) {
  const secret = 'e2e-custom-' + id
  const c = await request.post(`${API}/api/v1/sites/${site}/payments`, { headers: auth, data: { provider: 'custom', secret } })
  expect(c.status()).toBe(201)
  const conn = (await c.json()).id as string
  const body = JSON.stringify({
    id: 'evt_' + id,
    type: 'payment',
    at: new Date().toISOString(),
    payment: { id: 'ord_' + id, amount: 4900, tax: 900, currency: 'USD', kind: 'one_time', visitor },
  })
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', secret).update(ts + '.' + body).digest('hex')
  const r = await request.post(`${API}/webhooks/custom/${conn}`, {
    headers: { 'content-type': 'application/json', 'Trckable-Timestamp': ts, 'Trckable-Signature': 'v1=' + sig },
    data: body,
  })
  expect(r.ok()).toBeTruthy()
}

test('landing page and app on a subdomain: one visitor, one journey, the sale goes to the landing page', async ({ browser, request }) => {
  const run = `mh-${browser.browserType().name()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const context = await browser.newContext({ proxy: { server: PROXY } })
  const page = await context.newPage()
  let checkout = ''
  await page.route('https://buy.stripe.com/**', (r) => {
    checkout = r.request().url()
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>stripe</h1>' })
  })

  await page.goto(`http://example.com/landing/${run}/?utm_source=newsletter&utm_campaign=${run}`)
  await expect.poll(async () => (await events(request, `/landing/${run}`)).length, { timeout: 15_000 }).toBeGreaterThan(0)
  await page.click('#to-app')
  await page.waitForURL('http://app.example.com/**')
  await expect.poll(async () => (await events(request, `/app/${run}`)).length, { timeout: 15_000 }).toBeGreaterThan(0)

  // The cookie is the landing page's, on the parent domain: the app's proxy
  // refreshed that same one rather than minting a second.
  const vids = (await context.cookies(['http://example.com', 'http://app.example.com'])).filter((c) => c.name === 'trckable_vid')
  expect(vids.map((c) => c.domain)).toEqual(['.example.com'])

  await page.click('#buy')
  await page.waitForURL('https://buy.stripe.com/**')
  const ref = new URL(checkout).searchParams.get('client_reference_id')!
  expect(ref).toMatch(/^trckable_/)
  await sell(request, ref, run)

  const landing = await events(request, `/landing/${run}`)
  const inApp = await events(request, `/app/${run}`)
  const all = [...landing, ...inApp].filter((e) => e.kind === 'pageview')
  expect(all.length).toBe(2)
  expect(new Set(all.map((e) => e.visitor)).size).toBe(1)
  expect(new Set(all.map((e) => e.session)).size).toBe(1)
  expect(ref.replace(/^trckable_/, '').split('_')[0]).toBe(all[0].visitor)

  // The sale belongs to the campaign that brought the visitor to the landing page.
  await expect
    .poll(
      async () => {
        const r = await request.get(`${API}/api/v1/sites/${site}/report`, { headers: auth })
        const rows = ((await r.json()).current.revenue_dims?.campaign ?? []) as { value: string; revenue: number }[]
        return rows.find((x) => x.value === run)?.revenue ?? 0
      },
      { timeout: 15_000 },
    )
    .toBe(4000)
  await context.close()
})

test('the other way round: the app first, then the landing page, is still one visitor', async ({ browser, request }) => {
  const run = `mh2-${browser.browserType().name()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const context = await browser.newContext({ proxy: { server: PROXY } })
  const page = await context.newPage()
  await page.goto(`http://app.example.com/app/${run}/`)
  await expect.poll(async () => (await events(request, `/app/${run}`)).length, { timeout: 15_000 }).toBeGreaterThan(0)
  // The proxy set the cookie server-side, on the site's domain, not only the app's host.
  const vids = (await context.cookies('http://example.com')).filter((c) => c.name === 'trckable_vid')
  expect(vids.map((c) => c.domain)).toEqual(['.example.com'])
  await page.goto(`http://example.com/landing/${run}/`)
  await expect.poll(async () => (await events(request, `/landing/${run}`)).length, { timeout: 15_000 }).toBeGreaterThan(0)
  const all = [...(await events(request, `/app/${run}`)), ...(await events(request, `/landing/${run}`))].filter((e) => e.kind === 'pageview')
  expect(all.length).toBe(2)
  expect(new Set(all.map((e) => e.visitor)).size).toBe(1)
  await context.close()
})
