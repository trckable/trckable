// The share studio: the place picks the sizes and the picture's shape, a milestone is a card of its own, the post is
// editable and counted, and "Post on LinkedIn" opens LinkedIn's composer with a public link whose page carries the card.
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'
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

// The card never says a number the dashboard contradicts: its big number is the report's people for the same window
// (the last 7 or 30 days ending today; all time from the first data).
test('Share studio: the card number is the dashboard number for 7 days, 30 days and all time', async ({ page }) => {
  const dialog = await openStudio(page, 1280, cookie)
  const sites = ((await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; domain: string; timezone: string }[] }).sites
  const site = sites.find((s) => s.domain === STEADY_DOMAIN)
  if (!site) throw new Error('no steady site')
  const day = (back: number) => new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone || 'UTC' }).format(new Date(Date.now() - back * 86_400_000))
  const visitors = async (from: string) => {
    const res = await page.request.get(`${API}/api/v1/sites/${site.id}/report?from=${from}&to=${day(0)}`)
    return ((await res.json()) as { current: { kpis: { visitors: number } } }).current.kpis.visitors
  }
  const bigAfter = async (chip: string, period: string) => {
    const words = page.waitForResponse((r) => r.url().includes('format=json') && r.url().includes(`period=${period}`) && r.url().includes('t=overview'))
    await dialog.getByRole('button', { name: chip, exact: true }).click()
    return ((await (await words).json()) as { big: string }).big
  }
  expect(await bigAfter('30 days', '30d')).toBe((await visitors(day(29))).toLocaleString('en-US'))
  expect(await bigAfter('7 days', '7d')).toBe((await visitors(day(6))).toLocaleString('en-US'))
  expect(await bigAfter('All time', 'all')).toBe((await visitors('2012-01-01')).toLocaleString('en-US'))
})

/** The steady site, and the day `back` days ago in its zone: the card and the dashboard count the same days. */
async function steady(page: Page) {
  const sites = ((await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; domain: string; timezone: string }[] }).sites
  const site = sites.find((s) => s.domain === STEADY_DOMAIN)
  if (!site) throw new Error('no steady site')
  const day = (back: number) => new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone || 'UTC' }).format(new Date(Date.now() - back * 86_400_000))
  const visitors = async (from: string, to = day(0)) => {
    const res = await page.request.get(`${API}/api/v1/sites/${site.id}/report?from=${from}&to=${to}`)
    return ((await res.json()) as { current: { kpis: { visitors: number } } }).current.kpis.visitors.toLocaleString('en-US')
  }
  return { day, visitors }
}

test('Share studio: 12 months and a custom range say the dashboard\'s number for those days', async ({ page }) => {
  const dialog = await openStudio(page, 1280, cookie)
  const { day, visitors } = await steady(page)
  const bigFor = async (match: (u: string) => boolean) => {
    const words = page.waitForResponse((r) => r.url().includes('format=json') && r.url().includes('t=overview') && match(r.url()))
    return ((await (await words).json()) as { big: string; foot: string }).big
  }
  const year = bigFor((u) => u.includes('period=12mo'))
  await dialog.getByRole('button', { name: '12 months', exact: true }).click()
  const months = new Date(day(0) + 'T00:00:00Z')
  months.setUTCMonth(months.getUTCMonth() - 12)
  months.setUTCDate(months.getUTCDate() + 1)
  expect(await year).toBe(await visitors(months.toISOString().slice(0, 10)))
  // A custom range opens its two days; a pair that cannot be drawn says why and changes nothing.
  const from = day(10) // the steady site has two weeks behind it
  const to = day(3)
  const range = dialog.getByRole('group', { name: 'Custom range' })
  await dialog.getByRole('button', { name: 'Custom range', exact: true }).click()
  await expect(range).toBeVisible()
  const future = day(-2)
  await range.getByLabel('To').fill(future)
  await expect(range.getByRole('alert')).toHaveText('Pick a day no later than today')
  const custom = bigFor((u) => u.includes('period=custom') && u.includes(`from=${from}`) && u.includes(`to=${to}`))
  await range.getByLabel('To').fill(to)
  await range.getByLabel('From').fill(from)
  expect(await custom).toBe(await visitors(from, to))
  await expect(range.getByRole('alert')).toHaveCount(0)
  await range.getByLabel('From').fill(day(90))
  await expect(range.getByRole('alert')).toHaveText(/^There is no data before /)
})

test('Share studio: Copy link for all time works, and the link page shows the same number', async ({ page, browser }) => {
  const dialog = await openStudio(page, 1280, cookie)
  const { visitors } = await steady(page)
  const words = page.waitForResponse((r) => r.url().includes('format=json') && r.url().includes('period=all') && r.url().includes('t=overview'))
  await dialog.getByRole('button', { name: 'All time', exact: true }).click()
  const card = ((await (await words).json()) as { big: string }).big
  expect(card).toBe(await visitors('2012-01-01'))
  const copy = dialog.getByRole('button', { name: /^Copy link/ })
  await expect(copy).toBeEnabled()
  await copy.click()
  await expect(dialog.getByRole('button', { name: /^Link copied/ })).toBeVisible()
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  // The address names no period: the link keeps its own, and nobody can change it by editing the address.
  expect(link.searchParams.has('period')).toBe(false)
  const reader = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const tab = await reader.newPage()
  const report = tab.waitForResponse((r) => r.url().includes('/api/v1/share/report'))
  await tab.goto(`${API}${link.pathname}${link.search}&period=7d&from=2026-01-01&to=2026-01-02`)
  const shown = ((await (await report).json()) as { current: { kpis: { visitors: number } } }).current.kpis.visitors
  expect(shown.toLocaleString('en-US')).toBe(card)
  await reader.close()
})
