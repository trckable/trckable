// People and API keys as one look: an inline row adds someone, the role is a
// pill, a viewer's sites are a button, a key is created and revoked in place,
// and on a phone nothing is wider than the window. (people-rows.spec.ts: the
// popovers and the confirmation.)
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const email = `people-${tag}@example.com`
let AUTH: Record<string, string> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  AUTH = { Cookie: 'trckable_session=' + (await session('people')), 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
  // More than one site, or there is nothing to choose between.
  for (const n of ['a', 'b']) await request.post(`${API}/api/v1/sites`, { headers: AUTH, data: { domain: `people-${n}-${tag}.example` } })
  // Two keys, so the rows are there to measure.
  for (const n of ['one', 'two']) await request.post(`${API}/api/v1/keys`, { headers: AUTH, data: { name: `${n}-${tag}` } })
})

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('people'), url: API }])
})

test('add a viewer inline, limit their sites', async ({ page }) => {
  await page.goto(API + '/example.com?account=people')
  const window = page.getByRole('dialog', { name: 'Profile, your account' })
  await expect(window.getByRole('button', { name: 'Add someone' })).toBeVisible({ timeout: 15_000 })
  // No explainer paragraphs: the role explains itself.
  await expect(window.getByText(/Owners run the instance/)).toHaveCount(0)

  await window.getByRole('button', { name: 'Add someone' }).click()
  const add = window.locator('.add-row')
  await add.getByLabel('Email').fill(email)
  await add.getByRole('radio', { name: 'Owner' }).click()
  await add.getByRole('radio', { name: 'Viewer' }).click()
  await expect(add.getByRole('radio', { name: 'Viewer' })).toHaveAttribute('aria-checked', 'true')
  await add.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('dialog', { name: 'Their one-time password' }).getByRole('button', { name: 'Done' }).click()

  const row = window.locator('.person', { hasText: email })
  await expect(row).toBeVisible()
  await expect(row.getByRole('button', { name: `Role of ${email}: Viewer` })).toBeVisible()
  // A viewer's sites are one button; the person is not signed in yet: a clock.
  await expect(row.locator('.sites-btn .sites-text')).toHaveText('All sites')
  await expect(row.getByRole('img', { name: 'Not signed in yet' })).toBeVisible()

  await row.getByRole('button', { name: `${email} options` }).click()
  await page.getByRole('menuitem', { name: 'Allowed sites' }).click()
  const popup = page.getByRole('dialog', { name: `Allowed sites for ${email}` })
  await popup.getByRole('switch', { name: 'All sites' }).click()
  await popup.getByRole('checkbox').first().check()
  await popup.getByRole('button', { name: 'Save' }).click()
  await expect(row.locator('.sites-btn .site-mark')).toHaveCount(1)
  await expect(row.locator('.sites-btn .sites-text')).toHaveText(/^1 of \d+ sites$/)
})

test('create a key inline and revoke it', async ({ page }) => {
  const name = `key-${tag}`
  await page.goto(API + '/example.com?account=keys')
  const window = page.getByRole('dialog', { name: 'Profile, your account' })
  await window.getByRole('button', { name: 'Create key', exact: true }).first().click()
  await window.getByLabel('Key name').fill(name)
  await window.getByRole('button', { name: 'Create key', exact: true }).click()
  // The secret shows once, in its own row.
  const secret = window.getByRole('group', { name: 'Your new key' })
  await expect(secret.locator('code')).toContainText('tkb_')
  await secret.getByRole('button', { name: 'Close' }).click()
  await expect(secret).toHaveCount(0)
  const row = window.locator('.key-row', { hasText: name })
  await expect(row).toContainText('never')
  await row.getByRole('button', { name: `Revoke ${name}` }).click()
  await page.getByRole('dialog', { name: `Revoke "${name}"?` }).getByRole('button', { name: 'Revoke' }).click()
  await expect(row).toHaveCount(0)
})

test('at 390 px nothing is wider than the window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' }) // measure the window at rest, not mid-way through its opening scale
  for (const tab of ['people', 'keys']) {
    await page.goto(`${API}/example.com?account=${tab}`)
    const window = page.getByRole('dialog', { name: 'Profile, your account' })
    await expect(window.locator('.person').first()).toBeVisible({ timeout: 15_000 })
    expect(await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth)).toBe(true)
    expect(await window.locator('.window-body').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    // Controls are a comfortable size to tap.
    for (const b of await window.locator('.person .role-pill, .person .sites-btn, .person .btn').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43)
  }
})

test('opening the window shows no focus ring on the close button', async ({ page }) => {
  await page.goto(API + '/example.com?account=people')
  const window = page.getByRole('dialog', { name: 'Profile, your account' })
  await expect(window).toBeVisible({ timeout: 15_000 })
  await expect(window.getByRole('button', { name: 'Close' })).not.toBeFocused()
  await page.keyboard.press('Tab')
  await expect(window.locator(':focus-visible')).toHaveCount(1)
})
