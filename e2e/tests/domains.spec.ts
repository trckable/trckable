// A site seen on two domains gets a Domains tab in the Pages card; a click on
// a row filters the dashboard to that domain. A site on one domain has no tab.
// DOMAINS_SHOTS=<dir> also takes the pictures.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.DOMAINS_SHOTS
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const ua = (n: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/14${n} Safari/537.36`

test.describe.configure({ mode: 'serial' })

let cookie = ''
const two = `two-${Date.now()}.example.org`
const one = `one-${Date.now()}.example.org`

test.beforeAll(async ({ browser }) => {
  cookie = await session('domains')
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const page = await ctx.newPage()
  const make = async (domain: string, urls: string[]) => {
    const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
    expect(made.ok()).toBe(true)
    const id = ((await made.json()) as { id: string }).id
    for (const [i, u] of urls.entries()) {
      expect((await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': ua(i) }, data: { s: id, k: 'pv', u } })).ok()).toBe(true)
    }
    await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites/${id}/events?limit=10`, { headers: H })).json()) as { events: unknown[] }).events.length, { timeout: 15_000 }).toBe(urls.length)
  }
  await make(two, [`https://${two}/`, `https://${two}/pricing`, `https://docs.${two}/start`])
  await make(one, [`https://${one}/`])
  await ctx.close()
})

async function open(page: Page, path: string, width = Number(process.env.DOMAINS_WIDTH ?? 1440)) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(API + path)
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const width = page.viewportSize()!.width
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/domains-${name}-${width}-${scheme}.png`, fullPage: width < 700 })
  }
}


test('one domain: no tab', async ({ page }) => {
  await open(page, `/${one}?view=data`)
  await page.getByRole('tab', { name: 'Pages', exact: true }).click({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'Most viewed' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Domains' })).toHaveCount(0)
})
