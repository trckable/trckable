// A site seen on two domains says "· All" (or the domain) after its name and holds the choice in
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

const tag = (page: Page) => page.locator('.dom-btn')
const row = (page: Page) => page.locator('.dom-pop')
const opt = (page: Page, name: string | RegExp) => row(page).getByRole('menuitemradio', { name })

test('two domains: pick one in the site list, the dashboard follows; All clears it', async ({ page }) => {
  await open(page, `/${two}?view=data`)
  await expect(tag(page)).toHaveText('·All', { timeout: 30_000 })
  await shoot(page, 'all')
  await tag(page).click()
  await expect(opt(page, 'All domains')).toHaveAttribute('aria-checked', 'true')
  await shoot(page, 'menu')
  const docs = `docs.${two}`
  await opt(page, /^docs/).click()
  await expect(page).toHaveURL(/f=hostname%3Adocs\./)
  await expect(tag(page)).toHaveText('·docs')
  if (page.viewportSize()!.width >= 640) {
    const chip = page.locator('.toolbar-filters .chip:not(.more)')
    await expect(chip).toHaveCount(1)
    await expect(chip.locator('b')).toHaveAttribute('title', docs)
  }
  await shoot(page, 'picked')
  await tag(page).click()
  await expect(opt(page, /^docs/)).toHaveAttribute('aria-checked', 'true')
  await opt(page, 'All domains').click()
  await expect(page).not.toHaveURL(/hostname/)
  await expect(tag(page)).toHaveText('·All')
})

test('opened already filtered: every domain is listed and that one is on; Live has no domain control', async ({ page }) => {
  await open(page, `/${two}?view=data&f=hostname%3Adocs.${two}`)
  await expect(tag(page)).toHaveText('·docs', { timeout: 30_000 })
  await tag(page).click()
  await expect(row(page).getByRole('menuitemradio')).toHaveCount(3)
  await expect(opt(page, /^docs/)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  // Live shows every visit of the site and takes no filter, so it has no domain control.
  await open(page, `/${two}?view=live`)
  await expect(page.locator('.hdr-band')).toBeVisible({ timeout: 30_000 })
  await expect(tag(page)).toHaveCount(0)
})

test('one domain: nothing extra', async ({ page }) => {
  await open(page, `/${one}?view=data`)
  await expect(page.locator('.hdr-band')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'Pages', exact: true })).toBeVisible()
  await expect(tag(page)).toHaveCount(0)
})
