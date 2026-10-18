// Edges that work when clicked through and broke when loaded directly: a link opened signed out comes back to itself after
// signing in, a bad date in the address falls back instead of crashing, a report that cannot be read says so, and a theme
// chosen in one tab reaches the other.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const PASSWORD = 'polish e2e password 1'

test('a link opened signed out opens itself after signing in', async ({ page }) => {
  const cookie = await session('edge-gaps')
  const email = await page.request.get(`${API}/api/v1/me`, { headers: { cookie: `trckable_session=${cookie}` } }).then((r) => r.json() as Promise<{ email: string }>).then((m) => m.email)
  await page.goto(`${API}/example.com?period=7d`)
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/example\.com\?period=7d/)
})

test('a bad date in the address falls back to a normal page', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  await page.goto(`${API}/example.com?view=briefing&from=2026-13-45&to=abc`)
  await expect(page.getByRole('tablist', { name: 'View' })).toBeVisible()
  await expect(page.getByText(/Couldn.t draw this/)).toHaveCount(0)
})

test('a report that cannot be read says so and can be asked again', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  let fail = true
  await page.route(/\/api\/v1\/sites\/[^/]+\/report/, (route) => (fail ? route.fulfill({ status: 500, json: { error: 'boom' } }) : route.continue()))
  await page.goto(`${API}/history.example?view=briefing&period=7d`)
  const alert = page.getByRole('alert').filter({ hasText: /load/i })
  await expect(alert).toBeVisible()
  fail = false
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(alert).toHaveCount(0)
  await expect(page.locator('.brief')).toBeVisible()
})

test('a theme chosen in one tab reaches the other', async ({ page, context }) => {
  await context.addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  await page.goto(`${API}/example.com`)
  const other = await context.newPage()
  await other.goto(`${API}/example.com`)
  await other.evaluate(() => localStorage.setItem('trckable:theme', 'dark'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('closing Explore leaves it behind: Back does not open it again', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  await page.goto(`${API}/history.example?view=briefing&period=7d`)
  await page.getByRole('button', { name: /^Explore all data/ }).first().click()
  await expect(page).toHaveURL(/x=overview/)
  await expect(page.getByRole('tab', { name: 'Highlights' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/x=/)
  await page.goBack()
  await expect(page).not.toHaveURL(/x=/)
})

test('an address with a stray ending is the site, and an unknown site says so', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  await page.goto(`${API}/example.com/nope?period=7d`)
  await expect(page).toHaveURL(`${API}/example.com?period=7d`)
  await page.goto(`${API}/nosuch.site`)
  await expect(page.getByText('No site called nosuch.site')).toBeVisible()
  await expect(page).not.toHaveURL(/nosuch/)
})

test('a language chosen in one tab restarts the other in it', async ({ page, context }) => {
  await context.addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  await page.goto(`${API}/example.com`)
  const other = await context.newPage()
  await other.goto(`${API}/example.com`)
  const reloaded = page.waitForEvent('load')
  await other.evaluate(() => localStorage.setItem('trckable:lang', 'de'))
  await reloaded
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
})

test('a viewer opening a settings address is told, not left on nothing', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  await page.route(/\/api\/v1\/me(\?|$)/, async (route) => {
    const me = await (await route.fetch()).json()
    await route.fulfill({ json: { ...me, role: 'viewer' } })
  })
  await page.goto(`${API}/example.com?settings=sharing`)
  await expect(page.getByText('Not allowed')).toBeVisible()
  await expect(page).not.toHaveURL(/settings=/)
})

test('a period that cannot be read does not keep the last period\'s numbers under its name', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
  await page.goto(`${API}/history.example?view=briefing&period=7d`)
  await expect(page.locator('.brief')).toBeVisible()
  let fail = false
  await page.route(/\/api\/v1\/sites\/[^/]+\/report/, (route) => (fail ? route.abort() : route.continue()))
  fail = true
  await page.evaluate(() => {
    history.pushState({ d: 99 }, '', location.pathname + '?view=briefing&period=90d')
    window.dispatchEvent(new Event('trckable:navigate'))
  })
  await expect(page.getByRole('alert').filter({ hasText: /load/i })).toBeVisible()
  await expect(page.locator('.brief')).toHaveCount(0)
})

test.describe('a longer language on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('the incident page does not run past the screen in German', async ({ page }) => {
    await page.context().addCookies([{ name: 'trckable_session', value: await session('edge-gaps'), url: API }])
    await page.addInitScript(() => localStorage.setItem('trckable:lang', 'de'))
    await page.goto(`${API}/history.example/incidents`)
    const foot = page.locator('.inc-foot')
    await expect(foot).toBeVisible()
    const right = await foot.evaluate((e) => e.getBoundingClientRect().right)
    expect(right).toBeLessThanOrEqual(390)
  })
})
