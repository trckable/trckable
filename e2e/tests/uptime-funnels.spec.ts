// The uptime check a person steers (Settings → Alerts: a pause, and up to five more pages of their own domain) and the
// funnels a site keeps by name (Explore: save the one on screen, open one, rename it, delete it). UF_SHOTS=<folder>
// saves pictures for the review (UF_WIDTH and UF_SCHEME pick the size and the theme).
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server decides')

const SHOTS = process.env.UF_SHOTS
const SCHEME = process.env.UF_SCHEME === 'dark' ? 'dark' : 'light'
const WIDTH = Number(process.env.UF_WIDTH ?? 0)
test.use({ colorScheme: SCHEME, ...(WIDTH ? { viewport: { width: WIDTH, height: 844 } } : {}) })
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const shot = (page: Page, name: string) => (SHOTS ? page.screenshot({ path: `${SHOTS}/uf-${name}-${WIDTH || 1280}-${SCHEME}.png` }) : Promise.resolve(undefined))

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('uptime-funnels')
})

const signIn = (page: Page) => page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])

async function newSite(page: Page) {
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `uptime-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.test` } })
  expect(made.status()).toBe(201)
  return ((await made.json()) as { id: string }).id
}

test('pause the uptime check and add pages of the site to it', async ({ page }) => {
  await signIn(page)
  const site = await newSite(page)
  await page.goto(`${API}/settings?site=${site}&tab=alerts`)
  const card = page.locator('[data-uptime-check]')
  await expect(card).toBeVisible({ timeout: 15_000 })
  const sw = card.getByRole('switch', { name: 'Uptime check' })
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await shot(page, 'uptime-on')

  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await expect(card).toContainText('Paused')
  expect(((await (await page.request.get(`${API}/api/v1/sites/${site}/uptime`)).json()) as { paused: boolean }).paused).toBe(true)
  expect(((await (await page.request.get(`${API}/api/v1/sites/${site}`)).json()) as { uptime_paused?: boolean }).uptime_paused).toBe(true)
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')

  // Only a page of the site's own domain.
  const field = card.getByLabel('Page to check')
  await field.fill('https://evil.example/')
  await card.getByRole('button', { name: 'Add' }).click()
  await expect(card).toContainText('Use a page of your own site')
  for (const p of ['/pricing', '/blog', '/docs', '/about', '/contact']) {
    await field.fill(p)
    await card.getByRole('button', { name: 'Add' }).click()
    await expect(card.locator('li', { hasText: p })).toBeVisible()
  }
  await expect(field).toHaveCount(0) // five is the most
  await expect(card).toContainText('Up to 5 pages')
  await shot(page, 'uptime-pages')
  await card.getByRole('button', { name: 'Stop checking /blog' }).click()
  await expect(card.locator('li')).toHaveCount(4)
  await expect(field).toBeVisible()
})

test('save the funnel on screen, open it later, rename it and delete it', async ({ page }) => {
  await signIn(page)
  const name = `Pricing path ${Date.now()}`
  const renamed = `${name} v2`
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=funnels&fs=page:/&fs=page:/pricing`)
  const saved = page.locator('#xp [data-saved-funnels]')
  await expect(saved).toBeVisible({ timeout: 15_000 })
  await saved.getByRole('button', { name: 'Save this funnel' }).click()
  await saved.getByLabel('Funnel name').fill(name)
  await shot(page, 'funnel-naming')
  await saved.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(saved.getByLabel('Saved funnels')).toHaveValue(/fn_/)
  await expect(saved.getByRole('button', { name: 'Save this funnel' })).toHaveCount(0)

  // Later: the plain funnel, and the saved one opens from the picker.
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=briefing&period=7d&v=&x=funnels`)
  const picker = page.locator('#xp [data-saved-funnels]').getByLabel('Saved funnels')
  await expect(picker).toBeVisible({ timeout: 15_000 })
  await picker.selectOption({ label: name })
  await expect(page).toHaveURL(/fs=page%3A%2F&fs=page%3A%2Fpricing|fs=page:\/&fs=page:\/pricing/)
  await expect(picker).toHaveValue(/fn_/)
  await shot(page, 'funnel-saved')

  await saved.getByRole('button', { name: 'Rename' }).click()
  await saved.getByLabel('Funnel name').fill(renamed)
  await saved.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(saved.getByLabel('Saved funnels').locator('option', { hasText: renamed })).toHaveCount(1)

  await saved.getByRole('button', { name: 'Delete' }).click()
  await expect(saved).toContainText(`Delete ${renamed}?`)
  await saved.getByRole('button', { name: 'Delete' }).click()
  await expect(saved.getByLabel('Saved funnels').locator('option', { hasText: renamed })).toHaveCount(0)
})
