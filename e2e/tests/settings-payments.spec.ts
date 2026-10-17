// Settings → Payments: each provider the dialog lists is connected the way an
// owner without an API key would (the webhook added by hand), shows the
// address and the events it asks for, and then really takes that provider's
// signed webhooks: the sales of a scenario from the ledger's own fixtures land
// in the report, net of refunds. Live provider APIs are the boundary: the
// one-key setup calls out to the provider and is tested in Go against a fake.
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, openSettings, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

const FIXTURES = fileURLToPath(new URL('../../server/internal/ledger/testdata/', import.meta.url))
type Scenario = { provider: string; currency: string; events: unknown[]; expect: { amount: number; refunded: number }[] }
const scenario = (file: string) => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Scenario

const hmac = (key: string | Buffer, msg: string, enc: 'hex' | 'base64' = 'hex') => createHmac('sha256', key).update(msg).digest(enc)

/** The headers a provider signs its webhook with. */
function sign(provider: string, secret: string, body: string, at = Math.floor(Date.now() / 1000)): Record<string, string> {
  const ts = String(at)
  switch (provider) {
    case 'stripe':
      return { 'Stripe-Signature': `t=${ts},v1=${hmac(secret, `${ts}.${body}`)}` }
    case 'lemonsqueezy':
      return { 'X-Signature': hmac(secret, body) }
    case 'paddle':
      return { 'Paddle-Signature': `ts=${ts};h1=${hmac(secret, `${ts}:${body}`)}` }
    default: {
      // Polar and Dodo speak Standard Webhooks.
      const id = 'msg_' + randomBytes(6).toString('hex')
      const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
      return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': 'v1,' + hmac(key, `${id}.${ts}.${body}`, 'base64') }
    }
  }
}

const PROVIDERS = [
  { id: 'stripe', name: 'Stripe', file: 'stripe_checkout_tax.json', secret: 'whsec_e2e_stripe' },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', file: 'lemonsqueezy_subscription.json', secret: 'e2e_lemon_secret' },
  { id: 'polar', name: 'Polar', file: 'polar_refunds.json', secret: 'whsec_' + Buffer.from('e2e polar signing key 0123456789').toString('base64') },
  { id: 'paddle', name: 'Paddle', file: 'paddle_adjustments.json', secret: 'pdl_ntfset_e2e_secret' },
  { id: 'dodo', name: 'Dodo Payments', file: 'dodo_subscription.json', secret: 'whsec_' + Buffer.from('e2e dodo signing key 0123456789a').toString('base64') },
]

type Listing = { providers: { id: string; name: string; events: string[] }[] }
const money = async (page: Page, site: TestSite) => {
  const res = await page.request.get(`${API}/api/v1/sites/${site.id}/report?from=2025-01-01&to=2027-01-01`, { headers: H })
  return ((await res.json()) as { current: { money?: { revenue: number; refunds: number; payments: number; currency: string } } }).current.money
}

for (const p of PROVIDERS) {
  test(`${p.name}: connect by hand, see the address and the events, and its signed webhooks reach the report`, async ({ page }) => {
    test.setTimeout(120_000)
    const sc = scenario(p.file)
    const site = await newSite(page, `pay-${p.id}`)
    expect((await page.request.patch(`${API}/api/v1/sites/${site.id}`, { headers: H, data: { name: site.domain, currency: sc.currency } })).ok()).toBe(true)

    // Revenue has no switch: its section is the way in, and connecting a provider turns it on.
    await openSettings(page, site, 'payments')
    await expect(page.getByText('CONNECT A PROVIDER').or(page.getByText(/Connect a provider/i)).first()).toBeVisible()
    const listing = (await (await page.request.get(`${API}/api/v1/sites/${site.id}/payments`, { headers: H })).json()) as Listing
    const info = listing.providers.find((x) => x.id === p.id)!
    expect(info.name).toBe(p.name)

    // The picker lists the most used few; the rest are found by search.
    await page.getByRole('searchbox', { name: /^Search providers/ }).fill(p.name)
    await page.getByRole('button', { name: new RegExp(`^${p.name}`) }).first().click()
    const connect = page.getByRole('dialog', { name: `Connect ${p.name}` })
    await connect.getByRole('button', { name: /add the webhook myself/ }).click()
    const wiz = page.getByRole('dialog', { name: `${p.name} webhook` })
    // A provider the server already holds a secret for (Lemon Squeezy) opens no wizard by itself: it is under the connection's menu.
    if (!(await wiz.waitFor({ timeout: 4000 }).then(() => true, () => false))) {
      await page.getByRole('button', { name: `${p.name} options` }).click()
      await page.getByRole('menuitem', { name: /Webhook & signing secret/ }).click()
    }
    // Step 1: the address, which is this server's and this connection's.
    const hook = (await wiz.innerText()).match(new RegExp(`http\\S*/webhooks/${p.id}/(pc_[a-z0-9]+)`))
    expect(hook, 'the webhook address').not.toBeNull()
    const conn = hook![1]
    await wiz.getByRole('button', { name: 'Added it' }).click()
    // Step 2: every event it says to subscribe to is the server's list for the provider.
    const text = await wiz.innerText()
    for (const e of info.events) expect(text, `${p.name} asks for ${e}`).toContain(e)
    await wiz.getByRole('button', { name: 'Subscribed' }).click()
    // Step 3: the signing secret.
    // Lemon Squeezy asks for a secret, so trckable makes one (the wizard says there is nothing left to paste); the others show theirs to be pasted.
    let secret = p.secret
    if (p.id === 'lemonsqueezy') {
      const got = await page.request.get(`${API}/api/v1/sites/${site.id}/payments/${conn}/secret`, { headers: H })
      secret = ((await got.json()) as { secret: string }).secret
      expect(secret).not.toBe('')
    } else {
      await wiz.getByRole('textbox').fill(p.secret)
      await wiz.getByRole('button', { name: 'Save' }).click()
    }
    await wiz.getByRole('button', { name: 'Close' }).click({ timeout: 3000 }).catch(() => undefined)

    // The server answers to that connection, and to nobody else's signature.
    const first = JSON.stringify(sc.events[0])
    const url = `${API}/webhooks/${p.id}/${conn}`
    const bad = await page.request.post(url, { headers: { 'content-type': 'application/json', ...sign(p.id, 'not the secret', first) }, data: first })
    expect(bad.status()).toBeGreaterThanOrEqual(400)
    // Lemon Squeezy sends no time to check, so an old signature is as good as a new one there: it is not sent.
    if (p.id !== 'lemonsqueezy') {
      const stale = await page.request.post(url, { headers: { 'content-type': 'application/json', ...sign(p.id, secret, first, Math.floor(Date.now() / 1000) - 3 * 3600) }, data: first })
      expect(stale.status(), 'an old signature').toBeGreaterThanOrEqual(400)
    }
    expect((await page.request.post(`${API}/webhooks/${p.id}/pc_nobody`, { headers: { 'content-type': 'application/json', ...sign(p.id, secret, first) }, data: first })).status()).toBe(404)
    expect(await money(page, site)).toMatchObject({ payments: 0 })

    // The provider's own events, in the order it sent them.
    for (const ev of sc.events) {
      const body = JSON.stringify(ev)
      const res = await page.request.post(url, { headers: { 'content-type': 'application/json', ...sign(p.id, secret, body) }, data: body })
      expect(res.ok(), `${p.name} webhook: ${res.status()}`).toBe(true)
    }
    const paid = sc.expect.reduce((n, e) => n + e.amount - e.refunded, 0)
    const refunded = sc.expect.reduce((n, e) => n + e.refunded, 0)
    await expect.poll(async () => (await money(page, site))?.revenue, { timeout: 30_000 }).toBe(paid)
    expect(await money(page, site)).toMatchObject({ refunds: refunded, payments: sc.expect.length, currency: sc.currency })

    // Settings says so too, and the Revenue module is on.
    await openSettings(page, site, 'payments')
    await expect(page.locator('#payments')).toContainText(`1 provider connected · ${sc.expect.length} payment${sc.expect.length === 1 ? '' : 's'} recorded`, { timeout: 20_000 })
    const mods = (await (await page.request.get(`${API}/api/v1/sites/${site.id}/modules`, { headers: H })).json()) as { modules: { id: string; enabled: boolean }[] }
    expect(mods.modules.find((m) => m.id === 'revenue')?.enabled).toBe(true)
  })
}

test('Anything else: a signing secret trckable makes, the three kinds of event it lists, and a refund and a dispute that undo the sale', async ({ page }) => {
  const site = await newSite(page, 'pay-custom')
  const c = await page.request.post(`${API}/api/v1/sites/${site.id}/payments`, { headers: H, data: { provider: 'custom' } })
  expect(c.status()).toBe(201)
  const conn = (await c.json()) as { id: string; secret?: string }
  const secret = ((await (await page.request.get(`${API}/api/v1/sites/${site.id}/payments/${conn.id}/secret`, { headers: H })).json()) as { secret: string }).secret
  expect(secret).toMatch(/^whsec_/)
  const send = async (event: object) => {
    const body = JSON.stringify(event)
    const ts = String(Math.floor(Date.now() / 1000))
    const res = await page.request.post(`${API}/webhooks/custom/${conn.id}`, { headers: { 'content-type': 'application/json', 'Trckable-Timestamp': ts, 'Trckable-Signature': `v1=${hmac(secret, `${ts}.${body}`)}` }, data: body })
    expect(res.ok(), `${(event as { type: string }).type}: ${res.status()}`).toBe(true)
  }
  const at = new Date().toISOString()
  await send({ id: 'e1', type: 'payment', at, payment: { id: 'o1', amount: 4900, tax: 900, currency: 'USD', kind: 'one_time', email: 'a@example.com' } })
  await expect.poll(async () => (await money(page, site))?.revenue, { timeout: 20_000 }).toBe(4000) // net of tax
  await send({ id: 'e2', type: 'refund', at, refund: { id: 'r1', payment_id: 'o1', amount: 1000, currency: 'USD' } })
  await expect.poll(async () => (await money(page, site))?.refunds, { timeout: 20_000 }).toBeGreaterThan(0)
  expect((await money(page, site))?.revenue).toBeLessThan(4000)
  // A dispute that is lost takes the sale back as well.
  await send({ id: 'e3', type: 'payment', at, payment: { id: 'o2', amount: 2000, tax: 0, currency: 'USD', kind: 'one_time' } })
  await expect.poll(async () => (await money(page, site))?.payments).toBe(2)
  const before = (await money(page, site))!.revenue
  await send({ id: 'e4', type: 'dispute', at, dispute: { id: 'd1', payment_id: 'o2', amount: 2000, currency: 'USD', status: 'lost' } })
  await expect.poll(async () => (await money(page, site))?.revenue).toBe(before - 2000)
})
