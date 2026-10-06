// The dashboard keeps today current on its own: a visit shows in
// the Visitors tile without a reload — over the live stream, and by
// polling when the stream is blocked or held back by a buffering proxy.
import { expect, test, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { createServer, request as forward, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, TOKEN } from '../playwright.config'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'live e2e password 1'

// Signing in is limited to ten tries in ten minutes from one address, and the
// other suites need theirs: every worker here shares one session, made once
// by whichever gets there first.
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'live-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `live-${Date.now()}@example.com`
  // Other suites add their people at the same moment: a busy database is
  // tried again, a little later each time.
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

let cookie = ''

// The site has a visit before any test opens it, so it shows real numbers,
// not the sample a site with nothing in it yet shows.
test.beforeAll(async ({ browser, request }) => {
  cookie = await session()
  const site = (await (await request.get('/_site')).json()).site as string
  const page = await browser.newPage()
  await visit(page, 'live-seed')
  await page.close()
  await expect.poll(async () => {
    const r = await request.get(`${API}/api/v1/sites/${site}/events?limit=1`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    return ((await r.json()).events as unknown[]).length
  }, { timeout: 10_000 }).toBeGreaterThan(0)
})

// A cookie is kept per host, not per port: the one session serves the proxy too.
async function signIn(page: Page, base: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(base + '/example.com?view=data')
}

const tile = (page: Page, label: string) => page.locator('.kpi').filter({ has: page.locator('.label', { hasText: label }) }).locator('.value')
const num = async (page: Page, label: string) => Number((await tile(page, label).innerText()).replace(/[^\d]/g, '') || 0)

/** A new visitor on the test site, from a browser context of its own. */
async function visit(page: Page, name: string) {
  const ctx = await page.context().browser()!.newContext({ baseURL: 'http://127.0.0.1:18301' })
  const p = await ctx.newPage()
  await p.goto(`/r/${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/index.html`)
  await p.waitForTimeout(1500) // the pageview leaves
  await ctx.close()
}

async function seesTheVisit(page: Page, name: string, within: number) {
  await expect(tile(page, 'Visitors')).not.toHaveText('–', { timeout: 15_000 })
  const visitors = await num(page, 'Visitors')
  await visit(page, name)
  await expect.poll(() => num(page, 'Visitors'), { timeout: within }).toBeGreaterThan(visitors)
}

test('a visit shows without a reload', async ({ page }) => {
  await signIn(page, API)
  let reloads = 0
  page.on('framenavigated', (f) => f === page.mainFrame() && reloads++)
  await seesTheVisit(page, 'live', 5_000)
  expect(reloads).toBe(0)
})

test('with the stream blocked, polling brings the visit', async ({ page }) => {
  test.slow()
  await page.route('**/live', (route) => route.abort())
  await signIn(page, API)
  await seesTheVisit(page, 'blocked', 20_000)
})

// A proxy that holds a streamed response until it ends, like a CDN that
// buffers or compresses: the stream never speaks, the watchdog notices.
test('behind a buffering proxy, polling brings the visit', async ({ page }) => {
  test.slow()
  const target = new URL(API)
  const proxy: Server = createServer((req, res) => {
    const up = forward({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
      const chunks: Buffer[] = []
      r.on('data', (c: Buffer) => chunks.push(c))
      r.on('end', () => res.writeHead(r.statusCode ?? 502, r.headers).end(Buffer.concat(chunks)))
      r.on('error', () => res.destroy())
    })
    up.on('error', () => res.destroy())
    req.pipe(up)
    res.on('close', () => up.destroy())
  })
  await new Promise<void>((ok) => proxy.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
  try {
    await signIn(page, base)
    await seesTheVisit(page, 'buffered', 45_000)
  } finally {
    proxy.closeAllConnections()
    proxy.close()
  }
})
