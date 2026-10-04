import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

const MOCK = `http://127.0.0.1:${process.env.MOCK_PORT ?? '19400'}`
const SITE = 'tkb_test00000001'
const PROXY_KEY = 'tkb_px_testproxykey0001'
const API_KEY = 'tkb_live_testkey0001'
const USERS = {
  admin: 'admin-local-test',
  editor: 'editor-local-test',
  reader: 'reader-local-test',
}

type Seen = { path: string; key?: string; ip?: string; ua?: string; dnt?: string; body?: string; auth?: string; query?: string }
const seen = async (clear = false): Promise<Seen[]> => (await (await fetch(`${MOCK}/__seen${clear ? '?clear' : ''}`)).json()) as Seen[]

async function asUser(browser: Browser, user?: keyof typeof USERS): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  if (user) {
    await page.goto('/wp-login.php')
    await page.fill('#user_login', user)
    await page.fill('#user_pass', USERS[user])
    await page.click('#wp-submit')
    await page.waitForURL(/wp-admin|\/$/, { waitUntil: 'commit' }) // the dashboard behind it loads slowly and is not needed
  }
  return page
}

// One admin session for the whole file: signing in again and again is the slow part of a loaded machine.
let adminContext: BrowserContext
const admin = () => adminContext.newPage()
test.beforeAll(async ({ browser }) => {
  const page = await asUser(browser, 'admin')
  adminContext = page.context()
})
test.afterAll(async () => {
  await adminContext.close()
})

const tag = (page: Page) => page.locator('script#trckable-js')

const PAGE = '/wp-admin/admin.php?page=trckable'

/** Opens the trckable page as the admin, lets the test set fields, saves, and waits for the toast. */
async function saveSettings(browser: Browser, set: (page: Page) => Promise<void>) {
  const page = await admin()
  await page.goto(`${PAGE}&form=1`)
  await set(page)
  await page.click('#submit')
  await expect(page.locator('.trk-toast[data-saved="1"]')).toBeAttached({ timeout: 30_000 })
  await page.close()
}

/** A switch is a checkbox under a track: click its label. */
const flip = (page: Page, id: string, on: boolean) => page.locator(`#${id}`).setChecked(on, { force: true })

test.describe.configure({ mode: 'serial' })

test('a visitor gets the documented script tag in the head', async ({ browser }) => {
  const page = await asUser(browser)
  await page.goto('/')
  await expect(page.locator('head script#trckable-js')).toHaveCount(1)
  await expect(tag(page)).toHaveAttribute('src', `${MOCK}/js/${SITE}.js`)
  await expect(tag(page)).toHaveAttribute('data-site', SITE)
  expect(await tag(page).evaluate((el: HTMLScriptElement) => el.defer)).toBe(true)
  expect(await tag(page).getAttribute('data-cookieless')).toBeNull()
  expect(await tag(page).getAttribute('data-api')).toBeNull()
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __trckable?: unknown }).__trckable !== undefined)).toBe(true)
})

test('admins and editors are left out, everyone else is counted', async ({ browser }) => {
  for (const [user, counted] of [['admin', false], ['editor', false], ['reader', true]] as const) {
    const page = await asUser(browser, user)
    await page.goto('/')
    await expect(tag(page)).toHaveCount(counted ? 1 : 0)
    await page.context().close()
  }
})

test('the cookieless switch sets the attribute, the preview follows it, and a skipped role is skipped', async ({ browser }) => {
  await saveSettings(browser, async (p) => {
    await flip(p, 'trckable_cookieless', true)
    await expect(p.locator('[data-chip="cookieless"]')).toHaveText('cookieless ✓')
    await flip(p, 'trckable_exclude_staff', false)
    await expect(p.locator('[data-chip="staff"]')).toHaveText('admins counted')
    await flip(p, 'trckable_exclude_staff', true)
    await p.locator('label.trk-role', { hasText: 'Subscriber' }).click()
    await expect(p.locator('#trk-tag')).toContainText('data-cookieless')
  })
  const visitor = await asUser(browser)
  await visitor.goto('/')
  await expect(tag(visitor)).toHaveAttribute('data-cookieless', '')
  const reader = await asUser(browser, 'reader')
  await reader.goto('/')
  await expect(tag(reader)).toHaveCount(0)
  await saveSettings(browser, async (p) => {
    await p.locator('label.trk-role', { hasText: 'Subscriber' }).click()
  })
})

test('settings are checked: a wrong site ID is refused and the old one kept', async ({ browser }) => {
  const page = await admin()
  await page.goto(`${PAGE}&form=1`)
  await page.evaluate(() => document.querySelector('#trckable_site')?.removeAttribute('pattern'))
  await page.fill('#trckable_site', 'not-a-site')
  await page.click('#submit')
  await expect(page.locator('#setting-error-trckable_site')).toBeVisible()
  await expect(page.locator('#trckable_site')).toHaveValue(SITE)
})

test('the server is a choice: Cloud needs no address, your own needs https (http for localhost)', async ({ browser }) => {
  const own = `http://127.0.0.1:${MOCK.split(':')[2]}`
  await saveSettings(browser, async (p) => {
    await p.locator('label[for=trk-server-cloud]').click()
    await expect(p.locator('.trk-own')).toBeHidden()
    await expect(p.locator('#trk-tag')).toContainText('https://cloud.trckable.com/js/')
  })
  const visitor = await asUser(browser)
  await visitor.goto('/')
  await expect(tag(visitor)).toHaveAttribute('src', `https://cloud.trckable.com/js/${SITE}.js`)
  const page = await admin()
  await page.goto(`${PAGE}&form=1`)
  await expect(page.locator('.trk-server')).toHaveText('Cloud')
  await page.locator('label[for=trk-server-own]').click()
  await page.fill('#trckable_host', 'http://stats.example.com')
  await page.click('#submit')
  await expect(page.locator('#setting-error-trckable_host')).toBeVisible()
  await page.locator('label[for=trk-server-own]').click()
  await page.fill('#trckable_host', own)
  await page.click('#submit')
  await expect(page.locator('.trk-toast[data-saved="1"]')).toBeAttached({ timeout: 30_000 })
  await expect(page.locator('.trk-server')).toHaveText('127.0.0.1')
  await page.getByRole('button', { name: 'Check connection' }).click()
  await expect(page.locator('.trk-check[data-state="ok"]')).toContainText('site found')
})

test('the proxy forwards the script and events, and nothing else', async ({ browser, request }) => {
  await saveSettings(browser, async (p) => {
    await p.fill('#trckable_proxy_key', PROXY_KEY)
    await flip(p, 'trckable_proxy', true)
  })
  await seen(true)
  const visitor = await asUser(browser)
  await visitor.goto('/')
  await expect(tag(visitor)).toHaveAttribute('src', /\/wp-json\/trckable\/v1\/js\/tkb_test00000001\.js$/)
  await expect(tag(visitor)).toHaveAttribute('data-api', /\/wp-json\/trckable\/v1\/e$/)
  await expect.poll(async () => (await seen()).filter((s) => s.path === '/api/e').length).toBe(1)
  const event = (await seen()).find((s) => s.path === '/api/e')!
  expect(event.key).toBe(PROXY_KEY)
  expect(event.ip).toMatch(/^127\.0\.0\.1$|^::1$/)
  expect(JSON.parse(event.body!).s).toBe(SITE)
  // The visitor cookie comes back from the visitor's own site; other cookies do not.
  const cookies = await visitor.context().cookies()
  expect(cookies.map((c) => c.name)).toContain('trckable_vid')
  expect(cookies.map((c) => c.name)).not.toContain('other')

  const base = '/wp-json/trckable/v1'
  const script = await request.get(`${base}/js/${SITE}.js`)
  expect(script.status()).toBe(200)
  expect(script.headers()['content-type']).toContain('javascript')
  expect(await script.text()).toContain('currentScript')
  expect((await request.get(`${base}/js/tkb_other0000001.js`)).status()).toBe(404)
  expect((await request.get(`${base}/api/v1/sites`)).status()).toBe(404)
  expect((await request.get(`${base}/e`)).status()).toBe(404)
  expect((await request.post(`${base}/e`, { data: JSON.stringify({ s: 'tkb_other0000001', k: 'pv' }) })).status()).toBe(400)
  expect((await request.post(`${base}/e`, { data: 'not json' })).status()).toBe(400)
  expect((await request.post(`${base}/e`, { data: 'x'.repeat(20000) })).status()).toBe(413)
  const forwarded = (await seen()).filter((s) => s.path === '/api/e').length
  expect(forwarded).toBe(1) // none of the refused ones got through

  await saveSettings(browser, async (p) => {
    await flip(p, 'trckable_proxy', false)
  })
  expect((await request.get(`${base}/js/${SITE}.js`)).status()).toBe(404) // off means off
})

test('first run, on your own server: three steps, then the pill turns green when the first visit arrives', async ({ browser }) => {
  // Clearing the site ID brings the first-run card back.
  await saveSettings(browser, async (p) => {
    await p.fill('#trckable_site', '')
  })
  const page = await admin()
  await page.goto(PAGE)
  const card = page.locator('#trk-onboard')
  await expect(card).toHaveAttribute('data-step', '1')
  await expect(page.locator('.trk-pill')).toHaveText('Not connected')
  await page.locator('label[for=trk-server-own]').click()
  await page.fill('#trckable_host', 'ftp://nope')
  await card.getByRole('button', { name: 'Continue' }).click()
  await expect(card.locator('.trk-check[data-state="bad"]')).toBeVisible() // the address is checked first
  await page.fill('#trckable_host', MOCK)
  await card.getByRole('button', { name: 'Check connection' }).click()
  await expect(card.locator('.trk-check[data-state="ok"]')).toContainText('Server reached')
  await card.getByRole('button', { name: 'Continue' }).click()
  await expect(card).toHaveAttribute('data-step', '2')
  await page.fill('#trckable_site', 'tkb_unknown00001')
  await card.locator('.trk-step[data-n="2"]').getByRole('button', { name: 'Check connection' }).click()
  await expect(card.locator('.trk-check[data-state="bad"]')).toContainText('does not know')
  await page.fill('#trckable_site', SITE)
  await expect(page.locator('#trk-tag')).toContainText(`data-site="${SITE}"`)
  await card.locator('.trk-step[data-n="2"]').getByRole('button', { name: 'Check connection' }).click()
  await expect(card).toHaveAttribute('data-step', '3')
  await expect(page.locator('.trk-pill')).not.toHaveText('Not connected')
  await expect(card.locator('[data-wait-msg]')).toContainText('API key') // no key: nothing to watch with
  await page.fill('#trckable_api_key', API_KEY)
  await card.getByRole('button', { name: 'Save key' }).click()
  await expect(card).toHaveAttribute('data-done', '1', { timeout: 15_000 })
  await expect(page.locator('.trk-pill')).toHaveText('Connected · counting')
  await card.getByRole('link', { name: 'Open settings' }).click()
  await expect(page.locator('.trk-layout')).toBeVisible()
  await expect(page.locator('#trckable_site')).toHaveValue(SITE)
})

test('first run with trckable Cloud: no address to enter', async ({ browser }) => {
  await saveSettings(browser, async (p) => {
    await p.fill('#trckable_site', '')
  })
  const page = await admin()
  await page.goto(PAGE)
  const card = page.locator('#trk-onboard')
  await page.locator('label[for=trk-server-cloud]').click()
  await expect(page.locator('.trk-own')).toBeHidden()
  await card.getByRole('button', { name: 'Continue' }).click()
  await expect(card).toHaveAttribute('data-step', '2')
  await page.fill('#trckable_site', SITE)
  await expect(page.locator('#trk-tag')).toContainText(`src="https://cloud.trckable.com/js/${SITE}.js"`)
  // Back to the test server for what follows.
  await page.getByRole('link', { name: 'Skip, show all settings' }).click()
  await expect(page.locator('.trk-layout')).toBeVisible()
  await page.locator('label[for=trk-server-own]').click()
  await page.fill('#trckable_site', SITE)
  await page.fill('#trckable_host', MOCK)
  await page.click('#submit')
  await expect(page.locator('.trk-toast[data-saved="1"]')).toBeAttached({ timeout: 30_000 })
})

test('the preview shows your numbers with a key, and says sample data without one', async ({ browser }) => {
  const page = await admin()
  await page.goto(PAGE)
  const prev = page.locator('.trk-prev')
  await expect(prev.locator('[data-n="online"]')).toHaveText('7')
  await expect(prev.locator('[data-sample]')).toHaveText('Your numbers')
  await expect(prev.getByText('/pricing')).toBeVisible()
  await page.close()
  await saveSettings(browser, async (p) => {
    await p.fill('#trckable_api_key', '')
  })
  const nokey = await admin()
  await nokey.goto(PAGE)
  await expect(nokey.locator('.trk-prev [data-sample]')).toHaveText('Sample data')
  await expect(nokey.locator('[data-hint]')).toBeVisible()
  await expect(nokey.locator('.trk-pill')).toHaveText('Script added')
  await saveSettings(browser, async (p) => {
    await p.fill('#trckable_api_key', API_KEY)
  })
})

test('the dashboard widget shows who is online and visitors today, with a link', async ({ browser }) => {
  const page = await admin()
  await page.goto('/wp-admin/index.php')
  const widget = page.locator('#trckable_widget')
  await expect(widget.locator('[data-n="today"]')).toHaveText('114')
  await expect(widget.locator('[data-n="online"]')).toHaveText('7')
  await expect(widget.locator('.trk-spark')).toBeVisible()
  await expect(widget.getByRole('link', { name: 'Open trckable' })).toHaveAttribute('href', MOCK)
  const call = (await seen()).filter((s) => s.path.endsWith('/report')).pop()!
  expect(call.auth).toBe(`Bearer ${API_KEY}`)
  expect(call.query).toMatch(/from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d/)
})
