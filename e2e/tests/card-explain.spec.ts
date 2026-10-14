// The i on an answer card opens its tooltip: what was measured, why it
// matters, and one button; Escape closes it.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/explain-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

test('an answer explains itself in its tooltip: two lines and one button', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await page.context().addCookies([{ name: 'trckable_session', value: await session('explain'), url: API }])
  await page.goto(`${API}/example.com?v=story`)
  const ask = page.locator('.sv-answers .sv-answer').first().getByRole('button', { name: 'What does this mean?' })
  await ask.focus()
  await page.keyboard.press('Enter')
  const panel = page.locator('.sv-explain')
  await expect(panel).toContainText('Why it matters')
  await expect(panel.getByRole('button')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})
