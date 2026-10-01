// What goes wrong is said in a toast, in a few friendly words: never the
// server's own text, never red text under a form. A failed Add site (the
// server refuses it) is the case a person meets first.
import { expect, test, type Page } from '@playwright/test'
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

test('a refused Add site is a toast with Retry, not text under the field', async ({ page }) => {
  await refuseSites(page, 500, '{"error":"UNIQUE constraint failed: sites.domain"}')
  const wizard = await addSite(page, 'toast-check.example')
  const toast = page.getByRole('alert').getByText('Something went wrong')
  await expect(toast).toBeVisible()
  await expect(page.getByRole('alert').getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.getByText('UNIQUE constraint')).toHaveCount(0)
  await expect(wizard.locator('.confirm-err')).toHaveCount(0)
  // The field still says what is wrong with a domain, inline and short.
  await wizard.getByLabel('Domain').fill('not a domain')
  await wizard.getByLabel('Domain').blur()
  await expect(wizard.locator('.wiz-status.bad')).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(toast).toBeHidden()
})

test('a lost connection is said in a few words', async ({ page }) => {
  await page.route('**/api/v1/sites', (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()))
  await addSite(page, 'toast-offline.example')
  await expect(page.getByRole('alert').getByText("Can't reach the server")).toBeVisible()
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
