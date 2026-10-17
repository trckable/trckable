// A site seen on two domains says "/ All" (or the domain) after its name and holds the choice in
// the site switcher's menu as a compact row: a click
// filters the whole dashboard, All clears it, and the chip row agrees. A site
// on one domain has no switcher. Run at 1440 and at 390 (DOMAINS_WIDTH);
// SWITCHER_SHOTS=<dir> also takes the pictures.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.SWITCHER_SHOTS
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const ua = (n: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/15${n} Safari/537.36`

test.describe.configure({ mode: 'serial' })

let cookie = ''
const two = `swa-${Date.now()}.example.org`
const one = `swb-${Date.now()}.example.org`

test.beforeAll(async ({ browser }) => {
  cookie = await session('switcher')
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

async function open(page: Page, path: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: Number(process.env.DOMAINS_WIDTH ?? 1440), height: 900 })
  await page.goto(API + path)
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const width = page.viewportSize()!.width
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/switcher-${name}-${width}-${scheme}.png`, clip: { x: 0, y: 0, width, height: 360 } })
  }
}

// The domain picked is said in the site chip ("/ docs"); the choice is a section of the site list, under All sites.
const tag = (page: Page) => page.locator('#siteBtn .dom')
const phone = (page: Page) => page.viewportSize()!.width < 641
const openList = async (page: Page) => {
  await page.locator('#siteBtn').click()
  await expect(page.locator('#siteMenu.on')).toBeVisible()
}
const said = async (page: Page, text: string) => {
  if (text === '/All') await expect(tag(page)).toHaveCount(0)
  else await expect(tag(page)).toHaveText(text.replace('/', '/ '))
}
const row = (page: Page) => page.locator('#siteMenu .sites-domains').first()
const opt = (page: Page, name: string | RegExp) => row(page).getByRole('menuitemradio', { name })



test('one domain: nothing extra', async ({ page }) => {
  await open(page, `/${one}?view=data`)
  await expect(page.locator('.hdr-band')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'Pages', exact: true })).toBeVisible()
  await expect(tag(page)).toHaveCount(0)
})
