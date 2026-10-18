// Goals, end to end: a goal made in the dialog counts the visit that reached its page, and a button's attribute and a
// call from code count the way a real visitor sends them (the real tracker in a browser), each then read where a
// person reads it: the goals under the funnel in Explore. A goal is counted under a lowercase key and shown as written.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'
import { PORT, origin } from '../ports'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server counts')

const SITE_ORIGIN = origin(PORT.site)

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('goals-funnels')
})

const runId = (name: string) => `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

/** A page of the test site that carries the real tracker, with the given body. */
const open = (page: Page, path: string, body: string) => page.goto(`${SITE_ORIGIN}${path}?b=${encodeURIComponent(body)}`)

/** Explore's goals, narrowed to one page of the test site (the site holds the goals of every run). */
async function goals(page: Page, path: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/example.com?view=briefing&x=funnels&xf=${encodeURIComponent(`page:${path}`)}`)
  await expect(page.locator('#xp.on')).toBeVisible({ timeout: 15_000 })
}

const row = (page: Page, name: string) => page.locator('#xp .mk-goal', { has: page.locator('.gn', { hasText: new RegExp(`^${name}$`) }) })

/** Reloads until the goal is listed with this many visitors: the writer flushes about once a second. */
async function expectGoal(page: Page, name: string, visitors: number) {
  await expect(async () => {
    await page.reload()
    await expect(row(page, name)).toHaveCount(1, { timeout: 4_000 })
    await expect(row(page, name).locator('.gv')).toHaveText(String(visitors))
  }).toPass({ timeout: 30_000, intervals: [1_000, 1_500, 2_000] })
}

test('a page-visit goal made in the dialog counts the visit', async ({ page }) => {
  const run = runId('pagegoal')
  const path = `/g/${run}/thanks`
  const name = `pg-${run}`
  await open(page, path, '<h1>Thanks</h1>')
  await page.waitForTimeout(1500) // the pageview leaves

  await goals(page, path)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.pal.on .palbox input').fill('A goal')
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  await dialog.getByLabel('Goal name').fill(name)
  await dialog.getByLabel('Page', { exact: true }).fill(path)
  await dialog.getByRole('button', { name: 'Add goal' }).click()
  await expect(dialog.getByRole('list', { name: 'Page goals' })).toContainText(name)
  await dialog.getByRole('button', { name: 'Done' }).click()

  await goals(page, path)
  await expectGoal(page, name, 1)
  // The shared site keeps no goal from this run.
  const remove = page.getByRole('dialog', { name: 'Add goals' }).getByRole('button', { name: `Remove the goal ${name}` })
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+k')
    await page.locator('.pal.on .palbox input').fill('A goal')
    await page.keyboard.press('Enter')
    await expect(remove).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await remove.click()
})

test('a button with data-trckable-goal counts on its first click', async ({ page }) => {
  const run = runId('button')
  const goal = `Start free ${run}`
  const path = `/g/${run}/home`
  await open(page, path, `<h1>Home</h1><button id="go" data-trckable-goal="${goal}">Start free</button>`)
  await page.waitForTimeout(500)
  await page.locator('#go').click()
  await page.waitForTimeout(1500)
  await goals(page, path)
  await expectGoal(page, goal, 1)
})

test('a goal called from code, trckable("goal", name), counts', async ({ page }) => {
  const run = runId('code')
  const goal = `Signup ${run}`
  const path = `/g/${run}/join`
  await open(page, path, '<h1>Join</h1>')
  await page.waitForTimeout(500)
  await page.evaluate((g) => (window as unknown as { trckable: (c: string, n: string, p: object) => void }).trckable('goal', g, { plan: 'pro' }), goal)
  await page.waitForTimeout(1500)
  await goals(page, path)
  await expectGoal(page, goal, 1)
})
