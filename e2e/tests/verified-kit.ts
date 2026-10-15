// A real source for the Verified specs: Stripe connected by hand (a signing
// secret) and one signed sale delivered to the server, so the site's money is
// read from the provider and the server counts it as verified.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type APIRequestContext } from './fixtures'
import { API } from '../playwright.config'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const SECRET = 'whsec_e2e_verified'
const FIXTURE = join(fileURLToPath(new URL('../../server/internal/ledger/testdata/', import.meta.url)), 'stripe_checkout_tax.json')

/** Connects Stripe to the site and delivers its first sale. */
export async function stripeSale(request: APIRequestContext, site: string) {
  await request.put(`${API}/api/v1/sites/${site}/modules/revenue`, { headers: H, data: { enabled: true } })
  const made = await request.post(`${API}/api/v1/sites/${site}/payments`, { headers: H, data: { provider: 'stripe', secret: SECRET } })
  expect(made.ok(), await made.text()).toBe(true)
  const id = ((await made.json()) as { id: string }).id
  const body = JSON.stringify((JSON.parse(readFileSync(FIXTURE, 'utf8')) as { events: unknown[] }).events[0])
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
  const sent = await request.post(`${API}/webhooks/stripe/${id}`, { headers: { 'content-type': 'application/json', 'Stripe-Signature': `t=${ts},v1=${sig}` }, data: body })
  expect(sent.ok(), `webhook: ${sent.status()}`).toBe(true)
  return id
}

export type Source = { kind: 'snippet' | 'gsc' | 'payments'; provider?: string; ok: boolean; since: number; checked: number; detail: string }

/** The sources a page is told about, replaced: for the sites list and the shared link. */
export const sources = (list: Partial<Source>[]): Source[] =>
  list.map((s) => ({ kind: 'snippet', ok: true, since: Math.floor(Date.now() / 1000) - 86400 * 12, checked: Math.floor(Date.now() / 1000) - 720, detail: '', ...s }))
