// Peek: ⌘K opens a panel that says how to connect your own assistant
// over MCP: the config to paste, a link to the docs and a way to make a key.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

// The button waits for the site's first visit: make sure there is one.
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`/r/ask-${Date.now()}/index.html`)
  await p.waitForTimeout(1500)
  await ctx.close()
})

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('ask'), url: API }])
})

test('opens with the MCP setup, and closes again', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await page.goto(API + '/example.com')
  await expect(page.getByRole('button', { name: 'Peek' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const panel = page.getByRole('complementary', { name: 'Peek' })
  await expect(panel.getByRole('link', { name: 'Setup' })).toHaveAttribute('rel', /noopener/)
  await expect(panel).toContainText('TRCKABLE_API_KEY')
  await expect(panel.getByRole('button', { name: 'Create a key' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('aside.drawer.ask')).toHaveAttribute('aria-hidden', 'true')
})

test('Create a key opens the API keys', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough')
  await page.goto(API + '/example.com')
  await expect(page.getByRole('button', { name: 'Peek' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('complementary', { name: 'Peek' }).getByRole('button', { name: 'Create a key' }).click()
  await expect(page.getByRole('dialog', { name: 'Profile, your account' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'API keys', selected: true })).toBeVisible()
})
