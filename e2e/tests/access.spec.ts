// Limiting a viewer's sites: the owner's People list has an "Allowed sites"
// item in the person's ⋯ menu that opens a popup (All sites, or the ticked
// ones; Save and Cancel). A viewer's window is their own account alone, and
// their page has no settings cog.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'access e2e password 1'
const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const email = `access-${tag}@example.com`
let viewer = ''
let viewerId = ''
let AUTH: Record<string, string> = {}

// One worker for the file: each worker signs in once more, and signing in is limited.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'viewer'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  viewer = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  expect(viewer).toBeTruthy()
  // Site access is the owner's: their session, not the API token.
  AUTH = { Cookie: 'trckable_session=' + (await session('access')), 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
  // More than one site, or there is nothing to choose between.
  for (const n of ['a', 'b']) await request.post(`${API}/api/v1/sites`, { headers: AUTH, data: { domain: `access-${n}-${tag}.example` } })
  const list = await (await request.get(`${API}/api/v1/site-access`, { headers: AUTH })).json()
  viewerId = list.viewers.find((v: { email: string }) => v.email === email).id
})

test('the owner limits a viewer\'s sites in a popup, saved on Save', async ({ page, request }) => {
  const owner = await session('access')
  await page.context().addCookies([{ name: 'trckable_session', value: owner, url: API }])
  await page.goto(API + '/example.com?account=people')
  const window = page.getByRole('dialog', { name: 'Profile, your account' })
  const row = window.locator('.person', { hasText: email })
  await expect(row).toBeVisible({ timeout: 15_000 })
  // The sites are one button (its popover ticks them at once).
  await expect(row.locator('.sites-btn .sites-text')).toHaveText('All sites')
  await expect(row.getByRole('button', { name: `Allowed sites for ${email}` })).toBeVisible()

  await row.getByRole('button', { name: `${email} options` }).click()
  await page.getByRole('menuitem', { name: 'Allowed sites' }).click()
  const popup = page.getByRole('dialog', { name: `Allowed sites for ${email}` })
  await expect(popup).toBeVisible()
  // Focus stays inside the popup however far Tab goes, either way.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await popup.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  expect(await popup.evaluate((el) => el.contains(document.activeElement))).toBe(true)

  // Cancel saves nothing.
  await popup.getByRole('switch', { name: 'All sites' }).click()
  await popup.getByRole('checkbox').first().check()
  await popup.getByRole('button', { name: 'Cancel' }).click()
  await expect(popup).toBeHidden()
  const before = await (await request.get(`${API}/api/v1/site-access`, { headers: AUTH })).json()
  expect(before.viewers.find((v: { id: string }) => v.id === viewerId).sites).toBeNull()

  // Save keeps the one ticked site.
  await row.getByRole('button', { name: `${email} options` }).click()
  await page.getByRole('menuitem', { name: 'Allowed sites' }).click()
  await popup.getByRole('switch', { name: 'All sites' }).click()
  await popup.getByRole('checkbox').first().check()
  await popup.getByRole('button', { name: 'Save' }).click()
  await expect(popup).toBeHidden()
  await expect(row.locator('.sites-btn .site-mark')).toHaveCount(1)
  await expect(row.locator('.sites-btn .sites-text')).not.toHaveText('All sites')
  const after = await (await request.get(`${API}/api/v1/site-access`, { headers: AUTH })).json()
  expect(after.viewers.find((v: { id: string }) => v.id === viewerId).sites).toHaveLength(1)
})

test('a viewer\'s window is their account alone, and their page has no settings cog', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: viewer, url: API }])
  await page.goto(API + '/example.com?account=people')
  const window = page.getByRole('dialog', { name: 'Profile, your account' })
  await expect(window).toBeVisible({ timeout: 15_000 })
  await expect(window.getByRole('tab')).toHaveCount(0)
  await expect(window.locator('.account-role')).toHaveText('Viewer')
  await expect(window.getByRole('heading', { name: 'Sign-in and security' })).toBeVisible()
  await expect(window.getByText('Allowed sites')).toHaveCount(0)
  // With no navigation column the profile takes the window's width, and the email stays on one line.
  const card = await window.locator('.me-card').boundingBox()
  expect(card!.width).toBeGreaterThan(360)
  const line = await window.locator('.me-card .me-email').evaluate((el) => el.getClientRects().length === 1 && el.getBoundingClientRect().height < 30)
  expect(line).toBe(true)
  expect(await window.locator('.window-body').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Settings for/ })).toHaveCount(0)
  // Peek is the owner's: no button, and its key opens nothing.
  await expect(page.getByRole('button', { name: 'Peek' })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.locator('aside.drawer.ask[aria-hidden="false"]')).toHaveCount(0)
})
