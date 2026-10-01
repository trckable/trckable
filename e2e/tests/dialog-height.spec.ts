// A dialog hugs its content. Track a goal has four tabs of different heights;
// going to the tallest and back must leave the short one exactly as tall as its
// own content, never with the tallest tab's height kept as an empty block
// under the buttons.
import { expect, test, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('dialog-height')
})

/** The space between the dialog's last element and its bottom edge, less its padding. */
const slack = (page: Page) =>
  page.getByRole('dialog', { name: 'Add goals' }).evaluate((box) => {
    const last = box.lastElementChild as HTMLElement
    return Math.round(box.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).paddingBottom))
  })

test('Track a goal: every tab, in any order, ends at its own content', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `dialog-height-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id
  await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}/` } })
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites/${site}/events?limit=1`, { headers: H })).json()) as { events: unknown[] }).events.length, { timeout: 15_000 }).toBe(1)

  await page.goto(`${API}/${domain}?view=data`)
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('a')
  await page.locator('[data-create=goal]').click()
  const box = page.getByRole('dialog', { name: 'Add goals' })
  await expect(box).toBeVisible()

  const heights = new Map<string, number>()
  // The tallest first, then back to each shorter one.
  for (const tab of ['Page visit', 'Your code', 'Your server', 'Page visit', 'Button or link', 'Page visit']) {
    await box.getByRole('radio', { name: new RegExp(tab) }).click()
    // The height eases for a moment, then rests on the content: nothing under the last button.
    await expect.poll(() => slack(page), { message: `${tab}: an empty block under the buttons` }).toBeLessThanOrEqual(2)
    const h = (await box.boundingBox())!.height
    if (heights.has(tab)) expect(Math.abs(h - heights.get(tab)!), `${tab}: the same size every time`).toBeLessThanOrEqual(1)
    heights.set(tab, h)
  }
  // The tabs really differ, so the check above is not vacuous.
  expect(heights.get('Your code')!).toBeGreaterThan(heights.get('Page visit')! + 40)
})
