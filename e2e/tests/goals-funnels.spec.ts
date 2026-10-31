// Goals, end to end: a goal made in the dialog counts the visit that reached its page, and a button's attribute and a
// call from code count the way a real visitor sends them (the real tracker in a browser), each then read where a
// person reads it: the goals under the funnel in Explore. A goal is counted under a lowercase key and shown as written.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'
import { PORT, origin } from '../ports'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server counts')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
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

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

/** Track a goal, from the command palette (tried again while the page is still starting). */
async function openGoalDialog(page: Page) {
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+k')
    await page.locator('.pal.on .palbox input').fill('A goal', { timeout: 3_000 })
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Add goals' })).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
}

/** Opens Track a goal on the test site until the pages it suggests from have arrived. */
async function suggested(page: Page, want: string) {
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  // The shared test site has many pages with one visitor each and the report lists only its top ten: put the two
  // pages this run really visited at the end of that list, so the suggestions do not depend on the other suites.
  await page.route(/\/api\/v1\/sites\/[^/]+\/report\?/, async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as { current?: { dims: Record<string, { value: string; visitors: number }[] | null> } }
    const rows = body.current?.dims.page ?? []
    for (const value of ['/thanks', '/pricing']) if (!rows.some((r) => r.value === value)) rows.push({ value, visitors: 1 })
    if (body.current) body.current.dims.page = rows
    await route.fulfill({ response: res, json: body })
  })
  await expect(async () => {
    await page.goto(`${API}/example.com`)
    await openGoalDialog(page)
    await expect(dialog.getByRole('list', { name: 'Suggested' }).getByText(want, { exact: true })).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 40_000, intervals: [1_000, 2_000] })
  return dialog
}

test('Track a goal suggests goals from recorded pages, one click adds one, and a form row turns forms on', async ({ page }) => {
  await open(page, '/thanks', '<h1>Thanks</h1>')
  await open(page, '/pricing', '<h1>Pricing</h1>')
  await page.waitForTimeout(1500) // the pageviews leave
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const site = ((await (await page.request.get(`${API}/api/v1/sites`, { headers: H })).json()) as { sites: { id: string; domain: string }[] }).sites.find((s) => s.domain === 'example.com')!.id
  const forms = (on: boolean) => page.request.put(`${API}/api/v1/sites/${site}/modules/forms`, { headers: H, data: { enabled: on } })
  expect((await forms(false)).ok()).toBe(true)

  const dialog = await suggested(page, 'Opened pricing')
  const list = dialog.getByRole('list', { name: 'Suggested' })
  await expect(list.getByText('Reached thank-you page', { exact: true })).toBeVisible()
  await expect(list.getByText('Form submissions', { exact: true })).toBeVisible()

  await list.getByRole('button', { name: 'Count Opened pricing' }).click()
  await expect(dialog.getByRole('list', { name: 'Page goals' })).toContainText('Opened pricing')
  await expect(list.getByText('Opened pricing', { exact: true })).toHaveCount(0)

  await list.getByRole('button', { name: 'Count Form submissions' }).click()
  await expect(list.getByText('Form submissions', { exact: true })).toHaveCount(0)
  const mods = (await (await page.request.get(`${API}/api/v1/sites/${site}/modules`, { headers: H })).json()) as { modules: { id: string; enabled: boolean }[] }
  expect(mods.modules.find((m) => m.id === 'forms')?.enabled).toBe(true)

  // The shared site keeps nothing from this run.
  await dialog.getByRole('button', { name: 'Remove the goal Opened pricing' }).click()
  await expect(dialog.getByRole('button', { name: 'Remove the goal Opened pricing' })).toHaveCount(0)
  expect((await forms(false)).ok()).toBe(true)
})

test('a viewer cannot open Track a goal, so sees no suggestions', async ({ page }) => {
  const email = `goals-viewer-${Date.now()}@example.com`
  const password = 'goals e2e password 1'
  execFileSync(BIN, ['admin', 'add-user', email, '--role', 'viewer'], { input: password + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const viewer = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  expect(viewer).toBeTruthy()
  await page.context().addCookies([{ name: 'trckable_session', value: viewer, url: API }])
  await page.goto(`${API}/example.com`)
  await expect(page.getByRole('tablist', { name: 'View' })).toBeVisible({ timeout: 15_000 })
  // A viewer cannot open Track a goal, so there is nowhere for a suggestion to show.
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.pal.on .palbox input').fill('A goal')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Add goals' })).toHaveCount(0)
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
