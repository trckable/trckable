// A person's picture is their avatar everywhere it shows: the header button,
// Profile and their row in People all change together, with no reload, and
// another owner sees it on the same row.
import { expect, test, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const email = `pic-${tag}@example.com`
const oneTime = `one time ${tag} password`
const own = `my own password ${tag}`
let personId = ''
let cookie = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  const admin = { Cookie: 'trckable_session=' + (await session('people-avatars')), 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
  const made = await (await request.post(`${API}/api/v1/people`, { headers: admin, data: { email, role: 'owner', password: oneTime } })).json()
  personId = made.person.id
  // Their first sign-in, and the password of their own it asks for.
  const login = await request.post(`${API}/api/v1/login`, { data: { email, password: oneTime } })
  cookie = /trckable_session=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? ''
  const headers = { Cookie: 'trckable_session=' + cookie, 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
  // Choosing it signs them in again under a fresh cookie.
  const changed = await request.post(`${API}/api/v1/account/password`, { headers, data: { current: oneTime, password: own } })
  cookie = /trckable_session=([^;]+)/.exec(changed.headers()['set-cookie'] ?? '')?.[1] ?? ''
  expect(cookie).not.toBe('')
})

async function png(page: Page) {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 120
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#2a7'
    ctx.fillRect(0, 0, 120, 120)
    return c.toDataURL('image/png')
  })
  return Buffer.from(url.split(',')[1], 'base64')
}

const shown = (page: Page, where: string) => page.locator(where + ' img')

test('a new picture shows in the header, Profile and People at once, and goes at once', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(API + '/example.com?account=profile')
  // The window's name follows its tab, so it is found by its class.
  const window = page.locator('.modal.window')
  await expect(window).toBeVisible({ timeout: 15_000 })
  const header = '.account-btn'
  const profile = '.me-photo'
  await expect(shown(page, header)).toHaveCount(0)
  await expect(shown(page, profile)).toHaveCount(0)

  await page.locator('input[type=file][accept*="image/png"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await png(page) })
  await page.getByRole('button', { name: 'Save picture' }).click()
  await expect(page.locator('.crop-modal')).toHaveCount(0, { timeout: 10_000 })

  // No reload: the same page shows the picture in both, and in People.
  await expect(shown(page, header)).toHaveCount(1)
  await expect(shown(page, profile)).toHaveCount(1)
  await window.getByRole('tab', { name: /People/ }).click()
  const row = window.locator('.person.self')
  await expect(row.locator('img')).toHaveCount(1)
  await expect(row.locator('.person-avatar')).not.toHaveText(/\S/)
  const loaded = await row.locator('img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)
  expect(loaded).toBe(true)
  // The same version everywhere: a new picture is fetched under the same address.
  const versions = await page.evaluate(() => [...document.querySelectorAll('.account-btn img, .person.self img')].map((i) => new URL((i as HTMLImageElement).src).search))
  expect(new Set(versions).size).toBe(1)

  // Removing it: initials again, in all three, still without a reload.
  await window.getByRole('tab', { name: 'Account', exact: true }).click()
  await page.getByRole('button', { name: 'Remove your picture' }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(shown(page, profile)).toHaveCount(0)
  await expect(shown(page, header)).toHaveCount(0)
  await window.getByRole('tab', { name: /People/ }).click()
  await expect(window.locator('.person.self')).toBeVisible()
  await expect(shown(page, '.person.self')).toHaveCount(0)
  await expect(window.locator('.person.self .person-avatar')).toHaveText(/^\S$/)
})

test('another owner sees it on their row, from that person\'s own address', async ({ page, request }) => {
  const headers = { Cookie: 'trckable_session=' + cookie, 'X-Trckable-Request': '1' }
  const put = await request.put(`${API}/api/v1/account/avatar`, { headers, data: await png(page) })
  expect(put.status()).toBe(204)

  await page.context().addCookies([{ name: 'trckable_session', value: await session('people-avatars'), url: API }])
  await page.goto(API + '/example.com?account=people')
  const row = page.locator('.modal.window').locator('.person', { hasText: email })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row.locator('img')).toHaveAttribute('src', new RegExp(`^/api/v1/people/${personId}/avatar\\?v=`))
  await expect(row.locator('img')).toHaveJSProperty('complete', true)
  expect(await row.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})
