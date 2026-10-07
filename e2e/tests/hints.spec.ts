// Hints: three short "did you know" bubbles, one at a time, one a visit, each
// beside what it is about; Got it puts one away, Turn hints off silences all.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

// The site needs a first visit to have rows to point at.
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/hints-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('hints'), url: API }])
  // The first ten quiet seconds are the rules' (unit-tested): skip them here.
  await page.addInitScript(() => {
    const now = performance.now.bind(performance)
    performance.now = () => now() + 20000
  })
})

// A hint waits for what it is about to be on screen.
const look = async (page: import('@playwright/test').Page, selector: string) => {
  if (selector.includes('sv-')) await expect(page.locator('.sv-line')).toBeVisible()
  await expect(page.locator(selector).first()).toBeVisible()
  await page.locator(selector).first().scrollIntoViewIfNeeded()
}
const bubble = (page: import('@playwright/test').Page) => page.locator('.hint')
const newVisit = async (page: import('@playwright/test').Page, url: string) => {
  await page.evaluate(() => sessionStorage.clear())
  await page.goto(url)
}

test('the three hints come in order, one a visit', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await page.goto(`${API}/example.com?v=story`)
  await look(page, '.sv-answers .sv-answer')
  await expect(bubble(page)).toContainText('Each answer opens the full picture')

  await bubble(page).getByRole('button', { name: 'Got it' }).click()
  await expect(bubble(page)).toHaveCount(0)

  // Same visit: nothing more, even on Explore.
  await page.goto(`${API}/example.com?v=explore`)
  await page.waitForTimeout(2500)
  await expect(bubble(page)).toHaveCount(0)

  await newVisit(page, `${API}/example.com?v=explore`)
  await look(page, '#cards .bl-row')
  await expect(bubble(page)).toContainText('Click any row to filter')
  await bubble(page).getByRole('button', { name: 'Close hint' }).click()

  await newVisit(page, `${API}/example.com?v=explore`)
  await expect(bubble(page)).toContainText('to ask Peek anything about your numbers')
  await bubble(page).getByRole('button', { name: 'Got it' }).click()

  await newVisit(page, `${API}/example.com?v=story`)
  await page.waitForTimeout(2500)
  await expect(bubble(page)).toHaveCount(0)
})

test('Turn hints off ends them for good', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await page.goto(`${API}/example.com?v=story`)
  await look(page, '.sv-answers .sv-answer')
  await bubble(page).getByRole('button', { name: 'Turn hints off' }).click()
  await expect(bubble(page)).toHaveCount(0)
  await newVisit(page, `${API}/example.com?v=story`)
  await page.waitForTimeout(2500)
  await expect(bubble(page)).toHaveCount(0)
})

test('on a phone the bubble fits the screen and its buttons are 44px', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(`${API}/example.com?v=story`)
  await look(page, '.sv-answers .sv-answer')
  await expect(bubble(page)).toBeVisible()
  const box = (await bubble(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  for (const name of ['Got it', 'Close hint', 'Turn hints off']) {
    const b = (await bubble(page).getByRole('button', { name }).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)
  }
})
