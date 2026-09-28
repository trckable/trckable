// The visitor journey: opened from Live's list, it tells one visitor's story
// — an identity card, a timeline per visit with repeated views folded, goals
// and payments marked — and is a bottom sheet on a phone. The journey's
// answer is fixed here (a real visitor opens it), so the story is the same
// every run: a returning, paying visitor still on the site.
import { expect, test, type Page } from '@playwright/test'
import { session } from './session'
import { API } from '../playwright.config'

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('journey')
})

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const pv = (min: number, path: string, engaged_s = 20) => ({ at: ago(min), kind: 'pageview', path, engaged_s })
const LONG = '/blog/2026/09/a-very-long-article-about-self-hosted-analytics-and-why/comments'

const story = (visitor: string) => ({
  journey: {
    visitor,
    first_seen: ago(3 * 24 * 60),
    visits: [
      {
        start: ago(4),
        end: ago(0.2),
        channel: 'Search',
        referrer: 'google.com',
        country: 'AL',
        device: 'Mobile',
        browser: 'Safari',
        os: 'iOS',
        pageviews: 5,
        engaged_s: 140,
        events: [pv(4, '/'), pv(3.5, '/pricing'), pv(3, '/pricing'), pv(2.5, '/pricing'), { at: ago(2), kind: 'goal', goal: 'Signup' }, pv(1, LONG)],
      },
      {
        start: ago(3 * 24 * 60),
        end: ago(3 * 24 * 60 - 3),
        channel: 'Direct',
        country: 'AL',
        device: 'Desktop',
        browser: 'Chrome',
        os: 'macOS',
        pageviews: 1,
        engaged_s: 30,
        events: [pv(3 * 24 * 60, '/')],
      },
    ],
  },
  payments: [{ at: ago(1.5), amount: 4900, kind: 'charge', provider: 'stripe' }],
  currency: 'USD',
})

async function openJourney(page: Page) {
  // A real visitor, so Live's list has a row to open.
  const ctx = await page.context().browser()!.newContext({ baseURL: 'http://127.0.0.1:18301' })
  const p = await ctx.newPage()
  await p.goto(`/r/journey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/index.html`)
  await p.waitForTimeout(1500) // the pageview leaves
  await ctx.close()
  await page.route('**/api/v1/sites/*/journey/*', async (route) => {
    const visitor = new URL(route.request().url()).pathname.split('/').pop()!
    await route.fulfill({ json: story(visitor) })
  })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + '/example.com?view=live')
  const row = page.locator('.live-feed .live-open').first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Visitor journey' })
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(/^Visitor /)
  return dialog
}

test('tells one visitor’s story', async ({ page }) => {
  const dialog = await openJourney(page)
  await expect(dialog.getByText('Returning', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('status').filter({ hasText: 'On the site now' })).toBeVisible()
  await expect(dialog.locator('.jr-fact.money .jr-money')).toHaveText('$49.00')
  await expect(dialog.locator('.jr-fact.money .jr-chip')).toContainText('Search · google.com')

  const visits = dialog.getByRole('list', { name: 'Visits, newest first' }).locator(':scope > li')
  await expect(visits).toHaveCount(2)
  const newest = dialog.getByRole('list', { name: 'Visit 2, what they did' })
  // Three views of /pricing in a row are one node.
  await expect(newest.locator('.jr-node.page')).toHaveCount(3)
  await expect(newest.getByLabel('viewed 3 times in a row')).toBeVisible()
  await expect(newest.locator('.jr-node.goal')).toContainText('Signup')
  await expect(newest.locator('.jr-node.payment')).toContainText('$49.00')
  // A long path is cut in the middle, whole in its tooltip.
  const long = newest.locator('.jr-node.here .jr-path')
  await expect(long).toHaveAttribute('title', new RegExp(LONG.replace(/[/.]/g, '\\$&')))
  expect((await long.innerText()).includes('…')).toBe(true)
  // Times never wrap: one line each.
  for (const t of await dialog.locator('.jr-when').all()) {
    const box = await t.boundingBox()
    expect(box!.height).toBeLessThan(24)
  }
})

test('actions: filter by the source, copy id in the menu, Escape closes', async ({ page }) => {
  const dialog = await openJourney(page)
  await dialog.getByRole('button', { name: 'Visitor options' }).click()
  await expect(page.getByRole('menuitem', { name: 'Copy visitor id' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Data request…' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Erase visitor…' })).toBeVisible()
  await page.keyboard.press('Escape')
  await dialog.getByRole('list', { name: 'Visit 2, what they did' }).locator('xpath=..').locator('.jr-chip').click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/f=referrer(%3A|:)google\.com/)
  await expect(page).not.toHaveURL(/view=live/)
})

test('on a phone it is a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const dialog = await openJourney(page)
  const box = await dialog.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(375)
  expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(811)
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
