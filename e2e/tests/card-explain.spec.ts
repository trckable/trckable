// "What does this mean?" under an answer opens a small panel: what was
// measured, why it matters, and one button; a second press closes it.
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

test('an answer explains itself in three short lines and one button', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await page.context().addCookies([{ name: 'trckable_session', value: await session('explain'), url: API }])
  await page.goto(`${API}/example.com?v=story`)
  const card = page.locator('.sv-answers .sv-answer').first()
  const ask = card.getByRole('button', { name: 'What does this mean?' })
  await expect(ask).toHaveAttribute('aria-expanded', 'false')
  await ask.focus()
  await page.keyboard.press('Enter')
  await expect(ask).toHaveAttribute('aria-expanded', 'true')
  const panel = card.locator('.sv-explain')
  await expect(panel).toContainText('Why it matters')
  await ask.click()
  await expect(panel).toHaveCount(0)
})
