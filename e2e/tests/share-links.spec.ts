// Settings → Sharing: make a link in the card (no modal), copy it once, see it
// in the list, revoke it with the question in the row. Also the pictures for
// the review: POLISH_SHOTS=<folder> saves them.
import { expect, test, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const SCHEME = process.env.POLISH_SCHEME === 'dark' ? 'dark' : 'light'
test.use({ colorScheme: SCHEME })
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('share-links')
})

/** A site of its own, so the links here never meet another suite's. */
async function open(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `links-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example` } })
  expect(made.status()).toBe(201)
  const { id: site, domain } = (await made.json()) as { id: string; domain: string }
  // A first visit, or the site opens on its install page rather than its settings.
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  await page.request.post(`${API}/api/e`, { headers: { 'Content-Type': 'text/plain', 'User-Agent': ua }, data: JSON.stringify({ s: site, k: 'pv', u: `https://${domain}/`, r: '', w: 1400 }) })
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites`)).json()).sites as { id: string; last_event_at?: number }[]).find((x) => x.id === site)?.last_event_at ?? 0, { timeout: 15_000 }).toBeGreaterThan(0)
  await sharing(page, site)
  return site
}

/** Settings opens over the dashboard, and closing the address back to it does not bring it up again: go there. */
async function sharing(page: Page, site: string) {
  await page.goto(`${API}/settings?site=${site}&tab=sharing`)
  await expect(page.locator('#shares')).toBeVisible({ timeout: 15_000 })
}

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.locator('#shares').screenshot({ path: `${SHOTS}/${name}-${SCHEME}.png` })
}

test('make a link in the card, copy it, revoke it', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium only')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: API })
  const site = await open(page)
  const card = page.locator('#shares')

  // Empty: two words and a button.
  await expect(card.getByText('No links yet')).toBeVisible()
  await shot(page, 'empty')
  await card.getByRole('button', { name: 'New link' }).click()

  // The form is in the card, not in a modal.
  await expect(page.getByRole('dialog', { name: 'New shared link' })).toHaveCount(0)
  await card.getByLabel('Name').fill('For the board')
  await shot(page, 'form-public')
  await card.getByRole('button', { name: 'Password' }).click()
  const create = card.getByRole('button', { name: 'Create link' })
  await expect(create).toBeDisabled()
  await card.getByLabel('Password', { exact: true }).fill('a long enough phrase')
  await card.getByRole('switch', { name: 'Revenue' }).click()
  await card.getByRole('switch', { name: 'Notes' }).click()
  await card.getByRole('button', { name: '30d' }).click()
  await expect(card.getByRole('switch', { name: 'Revenue' })).toHaveAttribute('aria-checked', 'true')
  // The thumbnail follows: revenue tile in, and the lock shows the password screen.
  await expect(card.locator('.sl-tiles.four')).toBeVisible()
  await expect(card.locator('.sl-note').first()).toBeVisible()
  await shot(page, 'form-password')
  await card.getByRole('button', { name: 'Show the password screen' }).click()
  await expect(card.locator('.sl-locked')).toBeVisible()
  await card.getByRole('button', { name: 'Show the page' }).click()

  // A bad site address is named before anything is sent.
  await card.getByRole('switch', { name: 'Embed on sites' }).click()
  await card.getByLabel('Site addresses').fill('example.org/path')
  await expect(card.getByRole('alert')).toContainText('not a site address')
  await expect(create).toBeDisabled()
  await card.getByLabel('Site addresses').fill('https://example.org')
  await expect(create).toBeEnabled()
  await create.click()

  // Just created: the link, once.
  const url = card.locator('.sl-url')
  await expect(url).toHaveValue(/\/s\/[a-z0-9]{20,}$/)
  await expect(card.getByText('shown once')).toBeVisible()
  await expect(card.locator('.sl-code')).toContainText('<iframe')
  await card.getByRole('button', { name: 'QR code' }).click()
  await expect(card.getByRole('img', { name: 'QR code of the link' })).toBeVisible()
  await shot(page, 'created')
  await card.getByRole('button', { name: 'Copy', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await url.inputValue())
  await card.getByRole('button', { name: 'Done' }).click()
  await expect(card.locator('.sl-url')).toHaveCount(0)

  // The list row: locked, revenue on, notes on, embeddable, ends in a month.
  const row = card.locator('.sl-row', { hasText: 'For the board' })
  await expect(row.getByRole('img', { name: 'Password link' })).toBeVisible()
  await expect(row.getByRole('img', { name: 'Embeddable on https://example.org' })).toBeVisible()
  await expect(row.getByRole('img', { name: 'Revenue shown' })).toBeVisible()
  await expect(row.getByText(/^Ends /)).toBeAttached()
  // Notes are the one thing that changes on a link that exists.
  const notes = row.getByRole('button', { name: /^Notes shown/ })
  await notes.click()
  await expect(row.getByRole('button', { name: /^Notes hidden/ })).toBeVisible()
  await shot(page, 'list')

  // Revoke asks in the row, and Escape steps back.
  await row.getByRole('button', { name: 'Revoke For the board' }).click()
  await expect(row.getByText('Revoke it?')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row.getByText('Revoke it?')).toHaveCount(0)
  await row.getByRole('button', { name: 'Revoke For the board' }).click()
  await row.getByRole('button', { name: 'Revoke', exact: true }).click()
  await expect(card.locator('.sl-row', { hasText: 'For the board' })).toHaveCount(0)
  await expect(card.getByText('No links yet')).toBeVisible()
})

test('a phone sees the name and one line of small icons, and nothing spills sideways', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for the layout')
  await page.setViewportSize({ width: 390, height: 844 })
  const site = await open(page)
  for (const body of [
    { name: 'For the investors', password: 'phrase phrase', revenue: true, notes: true, days: 30 },
    { name: 'Public dashboard', revenue: false, days: 0, embed_origins: ['https://example.org'] },
  ])
    await page.request.post(`${API}/api/v1/sites/${site}/shares`, { headers: H, data: body })
  await sharing(page, site)
  const card = page.locator('#shares')
  await expect(card.locator('.sl-row')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const row = await card.locator('.sl-row').first().boundingBox()
  expect(row!.height).toBeLessThan(90)
  await shot(page, 'list-390')
  await card.getByRole('button', { name: 'New link' }).click()
  await card.getByRole('button', { name: 'Password' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await shot(page, 'form-390')
})
