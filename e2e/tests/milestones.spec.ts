// The Milestones window against a trckabled with the demo data (skipped
// unless TRCKABLE_A11Y_URL points at one, like header and fullcharts):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test milestones
// A hero for the newest one with Share and Replay, a ring for each next
// step, the reached ones as badges under their year, and everything shown
// at once when the person asks for reduced motion.
import { expect, test, type Page } from './fixtures'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

async function open(page: Page, reduced: boolean) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
  const res = await page.request.post(BASE + '/api/v1/login', { data: { email: EMAIL, password: PASSWORD } })
  expect(res.ok()).toBeTruthy()
  await page.goto(BASE + '/')
  const domain = await page.evaluate(async () => (await (await fetch('/api/v1/sites')).json()).sites[0].domain as string)
  await page.goto(`${BASE}/${domain}?view=data`)
  await expect(page.locator('.overview-chart .chart-wrap svg')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: /Milestones/ }).click()
  const win = page.getByRole('dialog', { name: 'Milestones' })
  await expect(win).toBeVisible()
  return win
}

test('the window: hero, four rings, reached badges by year', async ({ page }) => {
  const win = await open(page, false)
  const hero = win.locator('.ms-hero')
  await expect(hero).toBeVisible()
  await expect(hero.getByRole('button', { name: 'Share the card' })).toBeVisible()
  await expect(hero.getByRole('button', { name: 'Replay the way there' })).toBeVisible()
  await expect(win.locator('.ms-next svg')).toHaveCount(4)
  await expect(win.getByRole('heading', { name: /^Reached in \d{4}$/ }).first()).toBeVisible()
  expect(await win.locator('.ms-done').count()).toBeGreaterThan(2)
  await hero.getByRole('button', { name: 'Replay the way there' }).click()
  await expect(win.locator('.ms-moment')).toBeVisible()
  await hero.getByRole('button', { name: 'Share the card' }).click()
  await expect(page.getByRole('dialog', { name: 'Share milestone' })).toBeVisible()
})

test('reduced motion: everything is there and nothing animates', async ({ page }) => {
  const win = await open(page, true)
  await expect(win.locator('.ms-hero')).toBeVisible()
  await expect(win.locator('.ms-next')).toHaveCount(4)
  const running = await win.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.animationName !== undefined && /^ms-/.test((a as CSSAnimation).animationName)).length)
  expect(running).toBe(0)
  for (const t of await win.locator('.ms-tile').all()) await expect(t).toHaveCSS('opacity', '1')
})

test('a phone gets a full-screen sheet with two tiles a row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  const win = await open(page, false)
  const box = await win.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(388)
  expect(box?.height).toBeGreaterThanOrEqual(798)
  const cols = await win.locator('.ms-nexts').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(cols).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})
