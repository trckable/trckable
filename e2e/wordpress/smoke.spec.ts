import { test, expect, type Browser, type Page } from '@playwright/test'

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
    await page.waitForURL(/wp-admin|\/$/)
  }
  return page
}

const tag = (page: Page) => page.locator('script#trckable-js')

/** Opens Settings → trckable as the admin, lets the test set fields, and saves. */
async function saveSettings(browser: Browser, set: (page: Page) => Promise<void>) {
  const page = await asUser(browser, 'admin')
  await page.goto('/wp-admin/options-general.php?page=trckable')
  await set(page)
  await page.click('#submit')
  await expect(page.locator('#setting-error-settings_updated')).toBeVisible()
  await page.context().close()
}

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

test('the cookieless switch sets the attribute, and a skipped role is skipped', async ({ browser }) => {
  await saveSettings(browser, async (p) => {
    await p.check('#trckable_cookieless')
    await p.check('input[name="trckable_settings[exclude_roles][]"][value="subscriber"]')
  })
  const visitor = await asUser(browser)
  await visitor.goto('/')
  await expect(tag(visitor)).toHaveAttribute('data-cookieless', '')
  const reader = await asUser(browser, 'reader')
  await reader.goto('/')
  await expect(tag(reader)).toHaveCount(0)
  await saveSettings(browser, async (p) => {
    await p.uncheck('input[name="trckable_settings[exclude_roles][]"][value="subscriber"]')
  })
})

test('settings are checked: a wrong site ID is refused and the old one kept', async ({ browser }) => {
  const page = await asUser(browser, 'admin')
  await page.goto('/wp-admin/options-general.php?page=trckable')
  await page.evaluate(() => document.querySelector('#trckable_site')?.removeAttribute('pattern'))
  await page.fill('#trckable_site', 'not-a-site')
  await page.click('#submit')
  await expect(page.locator('#setting-error-trckable_site')).toBeVisible()
  await expect(page.locator('#trckable_site')).toHaveValue(SITE)
})

test('the proxy forwards the script and events, and nothing else', async ({ browser, request }) => {
  await saveSettings(browser, async (p) => {
    await p.fill('#trckable_proxy_key', PROXY_KEY)
    await p.check('#trckable_proxy')
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
    await p.uncheck('#trckable_proxy')
  })
  expect((await request.get(`${base}/js/${SITE}.js`)).status()).toBe(404) // off means off
})

test('the dashboard widget shows visitors today and now, with a link', async ({ browser }) => {
  await saveSettings(browser, async (p) => {
    await p.fill('#trckable_api_key', API_KEY)
  })
  const page = await asUser(browser, 'admin')
  await page.goto('/wp-admin/index.php')
  const widget = page.locator('#trckable_widget')
  await expect(widget).toContainText('1,234')
  await expect(widget).toContainText('7')
  await expect(widget.getByRole('link', { name: 'Open trckable' })).toHaveAttribute('href', MOCK)
  const call = (await seen()).find((s) => s.path.endsWith('/report'))!
  expect(call.auth).toBe(`Bearer ${API_KEY}`)
  expect(call.query).toMatch(/from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d/)
})
