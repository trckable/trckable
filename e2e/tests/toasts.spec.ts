// What goes wrong is said in a few friendly words: never the server's own
// text. A failed Add site (the server refuses it) is the case a person meets
// first; it is said under the field, in the same place as a bad domain.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

// Set TOAST_SHOTS to a folder to also take the pictures for review.
const SHOTS = process.env.TOAST_SHOTS

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('toasts'), url: API }])
})

/** The server refuses to create a site, with words no one should have to read. */
const refuseSites = (page: Page, status: number, body: string) =>
  page.route('**/api/v1/sites', (route) => (route.request().method() === 'POST' ? route.fulfill({ status, contentType: 'application/json', body }) : route.fallback()))

async function addSite(page: Page, domain: string) {
  await page.goto(`${API}/example.com?add=site`)
  const wizard = page.getByRole('dialog', { name: 'Add a site' })
  await wizard.getByLabel('Domain').fill(domain)
  await wizard.getByLabel('Domain').press('Enter')
  return wizard
}

test('a refused Add site says so under the field, in plain words', async ({ page }) => {
  await refuseSites(page, 500, '{"error":"UNIQUE constraint failed: sites.domain"}')
  const wizard = await addSite(page, 'toast-check.example')
  await expect(wizard.locator('.wiz-status.bad')).toHaveText('Couldn’t add the site. Try again in a moment.')
  await expect(wizard.getByLabel('Domain')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('UNIQUE constraint')).toHaveCount(0)
  // Typing again clears it; a bad domain is named inline, short.
  await wizard.getByLabel('Domain').fill('not a domain')
  await wizard.getByLabel('Domain').blur()
  await expect(wizard.locator('.wiz-status.bad')).toHaveText('Use a domain like example.com, with no spaces.')
})

test('a lost connection is said in a few words', async ({ page }) => {
  await page.route('**/api/v1/sites', (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()))
  const wizard = await addSite(page, 'toast-offline.example')
  await expect(wizard.locator('.wiz-status.bad')).toHaveText("Can't reach the server")
})

test('at most three at once, each with its own mark, and the quiet ones are polite', async ({ page }) => {
  await page.goto(`${API}/example.com?view=data`)
  await expect(page.locator('.kpi').first()).toBeVisible()
  await expect(page.locator('.toasts')).toBeAttached() // the toasts load apart from the page
  await page.evaluate(() => {
    const send = (id: number, text: string, kind: string) => window.dispatchEvent(new CustomEvent('trckable:toast', { detail: { id, text, kind } }))
    send(9001, 'Saved', 'success')
    send(9002, 'New version', 'info')
    send(9003, 'Almost full', 'warning')
    send(9004, 'Not saved', 'error')
  })
  await expect(page.locator('.toast')).toHaveCount(3)
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0) // the oldest made room
  await expect(page.getByRole('status').getByText('New version')).toBeVisible()
  await expect(page.getByRole('alert').getByText('Almost full')).toBeVisible()
  await expect(page.getByRole('alert').getByText('Not saved')).toBeVisible()
})

test('pictures for review', async ({ page }) => {
  test.skip(!SHOTS, 'only when TOAST_SHOTS names a folder')
  mkdirSync(SHOTS!, { recursive: true })
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    for (const scheme of ['dark', 'light'] as const) {
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(`${API}/example.com?view=data`)
      await expect(page.locator('.kpi').first()).toBeVisible()
      await expect(page.locator('.toasts')).toBeAttached()
      await page.evaluate(() => {
        const send = (id: number, text: string, kind: string, action?: { label: string; run: () => void }) => window.dispatchEvent(new CustomEvent('trckable:toast', { detail: { id, text, kind, action } }))
        send(9101, 'Saved', 'success')
        send(9102, 'Almost full', 'warning')
        send(9103, "Can't reach the server", 'error', { label: 'Retry', run: () => {} })
      })
      await expect(page.locator('.toast')).toHaveCount(3)
      await page.waitForTimeout(400) // the toasts have settled in
      await page.screenshot({ path: `${SHOTS}/public-toasts-${width}-${scheme}.png` })
    }
  }
})
