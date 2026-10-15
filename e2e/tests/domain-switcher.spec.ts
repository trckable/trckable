// A site seen on two domains shows All / each domain beside its name: a click
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

test('two domains: pick one, the dashboard follows; All clears it', async ({ page }) => {
  await open(page, `/${two}?view=data`)
  const phone = page.viewportSize()!.width < 640
  const group = page.locator('.dom-switch')
  await expect(group).toBeVisible({ timeout: 30_000 })
  const docs = `docs.${two}`
  if (phone) {
    await group.locator('.dom-menu').click()
    await shoot(page, 'menu')
    await page.getByRole('menuitemradio', { name: /^docs/ }).click()
    await expect(group.locator('.dom-menu')).toHaveText('docs')
  } else {
    await expect(group.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true')
    await shoot(page, 'all')
    await group.getByRole('radio', { name: 'docs' }).click()
    await expect(group.getByRole('radio', { name: 'docs' })).toHaveAttribute('aria-checked', 'true')
    await expect(group.getByRole('radio', { name: 'docs' })).toHaveAttribute('title', new RegExp(docs.replace(/\./g, '\\.')))
  }
  await expect(page).toHaveURL(/f=hostname%3Adocs\./)
  // The switcher stays after the report narrows to one domain.
  await expect(group).toBeVisible()
  if (!phone) {
    const chip = page.locator('.toolbar-filters .chip:not(.more)')
    await expect(chip).toHaveCount(1)
    await expect(chip.locator('b')).toHaveAttribute('title', docs)
  }
  await shoot(page, 'picked')
  if (phone) {
    await group.locator('.dom-menu').click()
    await page.getByRole('menuitemradio', { name: 'All domains' }).click()
  } else {
    await group.getByRole('radio', { name: 'All' }).click()
  }
  await expect(page).not.toHaveURL(/hostname/)
  await expect(group.locator(phone ? '.dom-menu' : '[aria-checked=true]')).toHaveText(phone ? 'All domains' : 'All')
})

test('one domain: no switcher', async ({ page }) => {
  await open(page, `/${one}?view=data`)
  await expect(page.locator('.hdr-band')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'Pages', exact: true })).toBeVisible()
  await expect(page.locator('.dom-switch')).toHaveCount(0)
})
