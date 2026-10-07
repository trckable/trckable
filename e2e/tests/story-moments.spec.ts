// The Story's moments are told on the chart itself: days that belong together are
// one moment (a soft band, one glass label with its days), the list on the right
// is gone and the chart has the whole card; a click, a tap or Enter on a label
// opens the story card in the page's top layer, never clipped by the chart's card
// and always inside the screen; Esc closes it. What the server finds is given by
// the browser here; everything else is real.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session, withoutPayments } from './session'

const day = (ago: number) => new Date(Date.now() - ago * 86400_000).toISOString().slice(0, 10)

/** Three days of new traffic from one source in a row, and one other source a few days earlier. */
const found = () => [
  ...[3, 4, 5].map((ago, k) => ({ t: `${day(ago)}T00:00`, kind: 'spike', visitors: 700 + k * 100, referrer: 'google.com' })),
  { t: `${day(12)}T00:00`, kind: 'spike', visitors: 300, referrer: 'news.example' },
]

let cookie = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session('story-moments')
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/story-moments-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

async function openStory(page: Page, width = 1280, height = 900) {
  await withoutPayments(page)
  await page.route(/\/api\/v1\/sites\/[^/]+\/moments\?/, (r) => r.fulfill({ json: { bucket: 'day', moments: found() } }))
  await page.route(/\/api\/v1\/sites\/[^/]+\/insights\?/, (r) => r.fulfill({ json: { insights: [] } }))
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height })
  await page.goto(`${API}/example.com?v=story`)
  await expect(page.locator('.sv-line')).toBeVisible({ timeout: 30_000 })
}

test('days that belong together are one moment, named in plain words, with its days', async ({ page }) => {
  await openStory(page)
  const labels = page.locator('button.sv-label')
  await expect(labels).toHaveCount(2, { timeout: 20_000 })
  // Three days of Google are one label, not three.
  const google = labels.filter({ hasText: 'Google found you' })
  await expect(google).toHaveCount(1)
  await expect(google).toContainText(/\d{1,2}[–-]\d{1,2}/)
  await expect(labels.filter({ hasText: 'News found you' })).toHaveCount(1)
  await expect(page.locator('.sv-band')).toHaveCount(2)
  await expect(page.locator('.sv-chart .kit-status')).toHaveText('2 moments · tap one to open it')
})

test('no list beside the chart and no numbered circles: the chart has the whole card', async ({ page }) => {
  await openStory(page)
  await expect(page.locator('button.sv-label').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.sv-moments, .sv-mark, .sv-chips, .sv-n')).toHaveCount(0)
  const card = await page.locator('.sv-chart').boundingBox()
  const plot = await page.locator('.sv-plot').boundingBox()
  expect(plot!.width).toBeGreaterThan(card!.width - 60) // the card's padding and nothing else
})

test('a label opens its story card in the top layer, whole and inside the screen, and Esc closes it', async ({ page }) => {
  await openStory(page)
  const label = page.locator('button.sv-label', { hasText: 'Google found you' })
  await expect(label).toBeVisible({ timeout: 20_000 })
  await label.click()
  const pop = page.getByRole('dialog', { name: 'Google found you' })
  await expect(pop).toBeVisible()
  await expect(pop).toContainText('Visitors in those days')
  await expect(pop.getByRole('button', { name: /Open these days/ })).toBeVisible()
  // Not inside the chart's card (nothing there can clip it), and on top: the label's neighbour under it is dimmed.
  expect(await pop.evaluate((el) => el.parentElement === document.body)).toBe(true)
  await expect(page.locator('.sv-span.dim')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)
})

test('a card opened near the bottom of the screen is flipped, never clipped', async ({ page }) => {
  await openStory(page, 1280, 700)
  const label = page.locator('button.sv-label', { hasText: 'Google found you' })
  await expect(label).toBeVisible({ timeout: 20_000 })
  // Scroll so the chart's label stands near the bottom edge of the screen.
  await label.evaluate((el) => el.scrollIntoView({ block: 'end' }))
  await page.evaluate(() => window.scrollBy(0, -20))
  await label.click()
  const pop = page.getByRole('dialog', { name: 'Google found you' })
  await expect(pop).toBeVisible()
  const box = (await pop.boundingBox())!
  const vp = page.viewportSize()!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
})

test('the keyboard reaches every label and Enter opens it; Open these days applies those days', async ({ page }) => {
  await openStory(page)
  const label = page.locator('button.sv-label', { hasText: 'Google found you' })
  await expect(label).toBeVisible({ timeout: 20_000 })
  await expect(label).toHaveAttribute('aria-label', /Tell the story/)
  await label.focus()
  await page.keyboard.press('Enter')
  const pop = page.getByRole('dialog', { name: 'Google found you' })
  await expect(pop).toBeVisible()
  await pop.getByRole('button', { name: /Open these days/ }).click()
  await expect(page).toHaveURL(/v=explore/)
  await expect(page).toHaveURL(new RegExp(`from=${day(5)}`))
  await expect(page).toHaveURL(new RegExp(`to=${day(3)}`))
})

test('on a phone the most important moment has the label, every moment is a band to tap, and the card is a sheet', async ({ page }) => {
  await openStory(page, 390, 844)
  await expect(page.locator('.sv-label')).toHaveCount(1, { timeout: 20_000 })
  const bands = page.locator('button.sv-band')
  await expect(bands).toHaveCount(2)
  for (const b of await bands.all()) expect((await b.boundingBox())!.width).toBeGreaterThanOrEqual(44)
  await bands.first().click()
  const pop = page.getByRole('dialog')
  await expect(pop.first()).toBeVisible()
  const box = (await pop.first().boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(390)
})
