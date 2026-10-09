// Goals and funnels, end to end: each way of counting a goal is sent the way a
// real visitor or server sends it (the real tracker in a browser, a POST to the
// ingest address) and then read where a person reads it, in the dashboard.
// Goal names are stored lowercase with dashes ("Start free" is "start-free"),
// and the Goals card shows them that way.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const SITE_ORIGIN = 'http://127.0.0.1:18301'
// A real browser's user agent, as a server forwards its visitor's.
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

let siteId = ''
let cookie = ''
test.beforeAll(async ({ request }) => {
  siteId = (await (await request.get('/_site')).json()).site
  cookie = await session('goals-funnels')
})

/** How the server stores a goal name: lowercase, every other run of characters one dash. */
const key = (g: string) => g.toLowerCase().replace(/[^a-z0-9_:]+/g, '-')

const runId = (page: Page, name: string) => `${name}-${page.context().browser()!.browserType().name()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

/** Opens a page of the test site that carries the real tracker (dev switch on, as the docs say for localhost) and the given body. */
async function open(page: Page, path: string, body: string) {
  await page.goto(`${SITE_ORIGIN}${path}?b=${encodeURIComponent(body)}`)
}

/** The dashboard of the test site as its owner, on the Data view. */
async function dashboard(page: Page, query = 'view=data') {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/example.com?${query}`)
  await expect(page.locator('[data-card=what]')).toBeVisible({ timeout: 15_000 })
}

/** The Data view narrowed to one page of the test site. The Goals card lists five rows, and the shared site holds the goals of every run and browser, so a goal is looked for among the visits to its own page. */
const onPage = (path: string) => `view=data&f=${encodeURIComponent(`page:${path}`)}`

const goalRow = (page: Page, name: string) => page.locator('[data-card=what] .goal', { has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) })

/** Reloads until the Goals card lists the goal with this many visitors: the writer flushes about once a second. */
async function expectGoal(page: Page, name: string, visitors: number) {
  await expect(async () => {
    await page.reload()
    const row = goalRow(page, name)
    await expect(row).toHaveCount(1, { timeout: 4_000 })
    await expect(row.locator('small')).toHaveText(visitors === 1 ? '1 visitor' : `${visitors} visitors`)
  }).toPass({ timeout: 30_000, intervals: [1_000, 1_500, 2_000] })
}

test('1. a page-visit goal made in Track a goal counts the visit', async ({ page }) => {
  const run = runId(page, 'pagegoal')
  const path = `/g/${run}/thanks`
  const name = `pg-${run}`
  await open(page, path, '<h1>Thanks</h1>')
  await page.waitForTimeout(1500) // the pageview leaves

  await dashboard(page)
  await page.locator('[data-card=what]').getByRole('button', { name: /Track a goal/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  await dialog.getByLabel('Goal name').fill(name)
  await dialog.getByLabel('Page').fill(path)
  await dialog.getByRole('button', { name: 'Add goal' }).click()
  await expect(dialog.getByRole('list', { name: 'Page goals' })).toContainText(name)
  await dialog.getByRole('button', { name: 'Done' }).click()

  await expectGoal(page, name, 1)
  // Clean up: the shared site keeps no goal from this run.
  await page.locator('[data-card=what] .kit-tools').getByRole('button', { name: /Track a goal/ }).click()
  await page.getByRole('dialog', { name: 'Add goals' }).getByRole('button', { name: `Remove the goal ${name}` }).click()
})

test('2. a button with data-trckable-goal counts on its first click, with no goal made in the dialog', async ({ page }) => {
  const run = runId(page, 'button')
  const goal = `Start free ${run}`
  const path = `/g/${run}/home`
  await open(page, path, `<h1>Home</h1><button id="go" data-trckable-goal="${goal}">Start free</button>`)
  await page.waitForTimeout(500)
  await page.locator('#go').click()
  await page.waitForTimeout(1500)

  await dashboard(page, onPage(path))
  await expectGoal(page, key(goal), 1)
})

test('3. a button goal with a property shows the property in the visitor journey', async ({ page }) => {
  const run = runId(page, 'props')
  const goal = `Go pro ${run}`
  const path = `/g/${run}/pricing`
  await open(page, path, `<h1>Pricing</h1><button id="go" data-trckable-goal="${goal}" data-trckable-goal-plan="pro">Go pro</button>`)
  await page.waitForTimeout(500)
  await page.locator('#go').click()
  await page.waitForTimeout(1500)

  await dashboard(page, onPage(path))
  await expectGoal(page, key(goal), 1)
  // The properties are read on the visitor's journey: open it from Live.
  await page.goto(`${API}/example.com?view=live`)
  const row = page.locator('.live-feed .live-open', { has: page.locator(`[title="Goal: ${key(goal)}"]`) })
  await expect(async () => {
    await page.reload()
    await expect(row.first()).toBeVisible({ timeout: 4_000 })
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000] })
  await row.first().focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Visitor journey' })
  const node = dialog.locator('.jr-node.goal', { hasText: key(goal) })
  await expect(node).toContainText('plan')
  await expect(node).toContainText('pro')
})

test('4. a goal called from code, trckable("goal", name), counts', async ({ page }) => {
  const run = runId(page, 'code')
  const goal = `Signup ${run}`
  const path = `/g/${run}/join`
  await open(page, path, '<h1>Join</h1><button id="go">Join</button>')
  await page.waitForTimeout(500)
  await page.evaluate((g) => (window as unknown as { trckable: (c: string, n: string, p: object) => void }).trckable('goal', g, { plan: 'pro' }), goal)
  await page.waitForTimeout(1500)

  await dashboard(page, onPage(path))
  await expectGoal(page, key(goal), 1)
})

test('5. a goal sent from a server, as the Your server tab writes it, counts', async ({ page, request }) => {
  const run = runId(page, 'server')
  const goal = `Server signup ${run}`
  await dashboard(page)
  await page.locator('[data-card=what]').getByRole('button', { name: /Track a goal/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add goals' })
  await dialog.getByRole('radio', { name: /Your server/ }).check({ force: true })
  const code = await dialog.locator('pre').innerText()
  await expect(dialog).toContainText('after the first event')

  // Send what the example says: its address, headers and body.
  const url = /curl -X POST (\S+)/.exec(code)![1].replace(/^https?:\/\/[^/]+/, API)
  const headers = Object.fromEntries([...code.matchAll(/-H '([^:']+):\s*([^']*)'/g)].map((m) => [m[1].toLowerCase(), m[2]]))
  const data = JSON.parse(/-d '([\s\S]*?)'\s*$/.exec(code.replace(/\\\n/g, ' '))![1].replace(/<[^>]*>/g, `${Date.now().toString(36)}.${Math.floor(Date.now() / 1000).toString(36)}`))
  data.n = goal
  expect(data.s).toBe(siteId)
  const res = await request.post(url, { headers: { 'user-agent': CHROME, ...headers }, data })
  expect(res.status()).toBe(202)

  await page.keyboard.press('Escape')
  await expectGoal(page, key(goal), 1)
})

test('6. a funnel of a page, a button goal and a code goal shows each step', async ({ page }) => {
  const run = runId(page, 'funnel')
  const button = `Fn click ${run}`
  const done = `Fn done ${run}`
  const path = `/g/${run}/landing`
  await open(page, path, `<h1>Landing</h1><button id="go" data-trckable-goal="${button}">Start free</button>`)
  await page.waitForTimeout(500)
  await page.locator('#go').click()
  await page.waitForTimeout(500)
  await page.evaluate((g) => (window as unknown as { trckable: (c: string, n: string) => void }).trckable('goal', g), done)
  await page.waitForTimeout(1500)

  await dashboard(page, onPage(path))
  await expectGoal(page, key(done), 1)
  await dashboard(page)
  await page.keyboard.press('a')
  await page.getByRole('menu', { name: 'Create something' }).getByRole('menuitem', { name: /Funnel/ }).click()
  const dialog = page.getByRole('dialog', { name: 'New funnel' })
  for (const step of [path, key(button), key(done)]) {
    await dialog.getByText('+ Add step').click()
    await page.getByRole('searchbox').fill(step)
    await page.getByRole('option', { name: step }).click()
  }
  await expect(dialog.locator('.funnel-steps .chip')).toHaveCount(3)
  await dialog.getByRole('button', { name: 'Show the funnel' }).click()
  await expect(page).toHaveURL(/mode=full.*fs=/)

  const fn = page.locator('.fn')
  await expect(fn).toBeVisible({ timeout: 15_000 })
  await expect(fn.locator('.fn-result')).toContainText('100% made it')
  // Each step with the one visitor who passed it.
  const steps = fn.locator('.fr-step')
  await expect(steps).toHaveCount(3)
  for (const [i, step] of [path, key(button), key(done)].entries()) {
    await expect(steps.nth(i).locator('.fr-label')).toHaveText(step)
    await expect(steps.nth(i).locator('.fr-count')).toHaveText('1')
  }
})
