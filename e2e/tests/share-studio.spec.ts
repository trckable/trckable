// The share studio: the place picks the sizes and the picture's shape, a milestone is a card of its own, the post is
// editable and counted, and "Post on LinkedIn" opens LinkedIn's composer with a public link whose page carries the card.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API } from '../playwright.config'
import { openStudio } from './share-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the studio')
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

const MILESTONES = { enabled: true, moment: null, milestones: [{ kind: 'visitors', step: '10000', value: 10000, day: '2026-10-20', created_at: 2, new: false, shared: false }, { kind: 'visitors', step: '1000', value: 1000, day: '2026-08-02', created_at: 1, new: false, shared: false }] }

test('Share studio: LinkedIn offers its sizes and the picture takes the size picked', async ({ page }) => {
  const dialog = await openStudio(page, 1280, cookie)
  const sizes = dialog.getByRole('group', { name: 'Size' })
  await expect(sizes.getByRole('button')).toHaveText([/Post.*1200×627/, /Square.*1080×1080/])
  await expect(sizes.getByRole('button', { name: /^Post/ })).toHaveAttribute('aria-pressed', 'true')
  const ratio = async () => {
    const b = await dialog.locator('.sd-frame').boundingBox()
    return b!.width / b!.height
  }
  expect(await ratio()).toBeCloseTo(1200 / 627, 1)
  await sizes.getByRole('button', { name: /^Square/ }).click()
  await expect.poll(ratio).toBeCloseTo(1, 1)
  // Another place: its own sizes, Instagram's post being 4:5.
  await dialog.getByRole('button', { name: 'More places' }).click()
  await dialog.locator('.sd-morelist').getByRole('button', { name: 'Instagram', exact: true }).click()
  await expect(sizes.getByRole('button')).toHaveText([/Post.*1080×1350/, /Story.*1080×1920/, /Square.*1080×1080/])
  await expect.poll(ratio).toBeCloseTo(1080 / 1350, 1)
})

test('Share studio: a milestone is a card of its own, drawn for that milestone', async ({ page }) => {
  await page.route('**/api/v1/sites/*/milestones', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: MILESTONES }) : r.fallback()))
  const dialog = await openStudio(page, 1280, cookie)
  const asked = page.waitForRequest((r) => r.url().includes('/card?') && r.url().includes('t=milestone') && r.url().includes('ms=visitors%7E10000') && !r.url().includes('thumb=1') && !r.url().includes('format=json'))
  await dialog.getByRole('group', { name: 'Cards' }).getByRole('button', { name: /^Milestones/ }).click()
  await asked
  // Newest first, and a card with no span of time has no periods.
  await expect(dialog.getByRole('radiogroup', { name: 'Cards' }).getByRole('radio')).toHaveCount(2)
  await expect(dialog.getByRole('button', { name: '30 days', exact: true })).toHaveCount(0)
})

test('Share studio: the post is written from the card, can be edited, and X counts it with the link', async ({ page }) => {
  const dialog = await openStudio(page, 1280, cookie)
  const text = dialog.getByRole('textbox')
  await expect(text).not.toHaveValue('')
  await dialog.getByRole('button', { name: 'X', exact: true }).click()
  const len = (await text.inputValue()).length
  await expect(dialog.getByText(`${len + 24} / 280`)).toBeVisible()
  await text.fill('My own words')
  await expect(dialog.getByText(`${'My own words'.length + 24} / 280`)).toBeVisible()
  // A card or a period picked after the edit keeps it.
  await dialog.getByRole('button', { name: '30 days', exact: true }).click()
  await expect(text).toHaveValue('My own words')
})

test('Share studio: the style is kept for the site', async ({ page }) => {
  const dialog = await openStudio(page, 1280, cookie)
  await dialog.getByRole('radio', { name: 'Ocean' }).click()
  await dialog.getByRole('switch', { name: 'Date' }).click()
  await page.reload()
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  await page.locator('.share-chip').click()
  const again = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(again.getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true')
  await expect(again.getByRole('switch', { name: 'Date' })).toHaveAttribute('aria-checked', 'false')
})

test('Share studio: Post on LinkedIn opens LinkedIn with a public link whose preview is the card', async ({ page, context }) => {
  await context.route('https://www.linkedin.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>LinkedIn</title>' }))
  const dialog = await openStudio(page, 1280, cookie)
  await dialog.getByRole('group', { name: 'Size' }).getByRole('button', { name: /^Square/ }).click()
  const popup = page.waitForEvent('popup')
  await dialog.getByRole('button', { name: /^Post on LinkedIn/ }).click()
  const win = await popup
  await win.waitForURL(/^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\//)
  const shared = new URL(win.url()).searchParams.get('url')!
  expect(shared).toMatch(/\/s\/[^/?]+\?/)
  const link = new URL(shared)
  expect(link.searchParams.get('shape')).toBe('square')
  // The link's page says the card at that size is its picture, and the picture is drawn at it.
  const html = await (await page.request.get(`${API}${link.pathname}${link.search}`)).text()
  expect(html).toContain('property="og:image:width" content="1080"')
  expect(html).toContain('property="og:image:height" content="1080"')
  const img = html.match(/property="og:image" content="([^"]+)"/)![1].replace(/&amp;/g, '&')
  const png = await page.request.get(new URL(img, API).toString())
  expect(png.status()).toBe(200)
  expect(png.headers()['content-type']).toBe('image/png')
})
