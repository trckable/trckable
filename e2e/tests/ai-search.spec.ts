// AI & Search, against a trckabled with the demo data (skipped unless
// TRCKABLE_A11Y_URL points at one):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test ai-search --project=chromium --workers=1
// One tab in Who came with three columns, a click that filters, the setup
// sheet from the crawler column, and (with TRCKABLE_SHOTS) the pictures.
import { expect, test, type Page } from '@playwright/test'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.TRCKABLE_A11Y_URL
const EMAIL = process.env.TRCKABLE_A11Y_EMAIL ?? 'me@site.com'
const PASSWORD = process.env.TRCKABLE_A11Y_PASSWORD ?? 'correct horse battery'
const SHOTS = process.env.TRCKABLE_SHOTS // a folder: screenshots, for review

test.skip(!BASE, 'set TRCKABLE_A11Y_URL to a running trckabled with data')

async function session(): Promise<string> {
  const file = join(tmpdir(), `trckable-aisearch-${new URL(BASE!).port}-${process.ppid}`)
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const res = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

async function open(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'trckable_session', value: await session(), url: BASE! }])
  await page.goto(BASE + '/')
  const site = await page.evaluate(async () => {
    const s = (await (await fetch('/api/v1/sites')).json()).sites[0]
    return { id: s.id as string, domain: s.domain as string }
  })
  await page.goto(`${BASE}/${site.domain}?mode=full`)
  const who = page.locator('[data-card=who]')
  await who.getByRole('tab', { name: 'AI & Search', exact: true }).click({ timeout: 20_000 })
  await expect(who.getByRole('group', { name: 'AI crawlers' })).toBeVisible({ timeout: 20_000 })
  return { site, who }
}

test('the three columns, and a page row that filters the dashboard', async ({ page }) => {
  const { who } = await open(page)
  const cols = who.locator('.ais-col')
  await expect(cols).toHaveCount(3)
  await expect(cols.nth(1).locator('.bl-row').first()).toContainText(/ChatGPT|Claude|Perplexity|Gemini|Copilot/)
  await expect(cols.nth(2).locator('.bl-row').first()).toBeVisible()
  const row = who.locator('.ais-pg-main').first()
  await expect(row).toHaveAttribute('aria-label', /AI read this [\d,]+ times?, sent [\d,]+ visitors?/)
  await row.click()
  await expect(page).toHaveURL(/[?&]f=page/)
})

test('Connect crawler data: three steps, the code carries the site, and nothing about a visitor', async ({ page }) => {
  const { site } = await open(page)
  // The demo site has robots: open the same sheet from the Crawlers tab.
  await page.locator('[data-card=who]').getByRole('tab', { name: 'Crawlers' }).click()
  await page.getByRole('button', { name: 'How to feed this' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.locator('.cs-steps > li')).toHaveCount(3)
  await expect(sheet.locator('pre.code').first()).toContainText('waitUntil')
  await expect(sheet.locator('pre.code').first()).toContainText(site.id)
  await sheet.getByRole('tab', { name: 'Nginx' }).click()
  await expect(sheet.locator('pre.code')).toHaveCount(2)
  await sheet.getByRole('tab', { name: 'Caddy' }).click()
  await expect(sheet.locator('pre.code').first()).toContainText('jq -c --unbuffered')
  expect(await sheet.innerText()).not.toMatch(/cookie|x-forwarded|remote_addr/i)
  await expect(sheet.locator('.cs-status')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})

test('pictures: dark and light at 1280, and 390', async ({ page }) => {
  test.skip(!SHOTS, 'set TRCKABLE_SHOTS to a folder')
  for (const [scheme, width] of [['dark', 1280], ['light', 1280], ['dark', 390]] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const { who } = await open(page, width)
    await page.evaluate((s) => document.documentElement.setAttribute('data-theme', s), scheme)
    await who.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await who.screenshot({ path: join(SHOTS!, `ai-search-${scheme}-${width}.png`) })
  }
})

test('pictures: Search Console answering, the two badges, and the setup sheet', async ({ page }) => {
  test.skip(!SHOTS, 'set TRCKABLE_SHOTS to a folder')
  // Search Console cannot be reached from a demo server: it answers here with fixed rows, and one page it ranks that no AI crawler reads.
  await page.route('**/report/search?*', (route) =>
    route.fulfill({ json: { rows: [{ key: 'self hosted analytics', clicks: 120, impressions: 2400, ctr: 0.05, position: 4.2 }, { key: 'privacy friendly analytics', clicks: 64, impressions: 1900, ctr: 0.034, position: 6.8 }], clicks: 184, impressions: 4300 } }),
  )
  await page.route('**/report/ai-search?*', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.google = true
    body.pages = [...body.pages.slice(0, 3), { path: '/guide/self-hosting', read: 0, sent: 0, clicks: 80, flag: 'unread' }]
    await route.fulfill({ response: res, json: body })
  })
  const { who } = await open(page)
  await expect(who.locator('.ais-flag.unread')).toBeVisible()
  await who.scrollIntoViewIfNeeded()
  await who.screenshot({ path: join(SHOTS!, 'ai-search-badges-1280.png') })
  await who.locator('.ais-flag.unread').hover()
  await expect(page.getByRole('tooltip')).toContainText('80 clicks')
  await who.screenshot({ path: join(SHOTS!, 'ai-search-badge-tooltip-1280.png') })
  await page.mouse.move(0, 0)
  await who.getByRole('tab', { name: 'Crawlers' }).click()
  await page.getByRole('button', { name: 'How to feed this' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: join(SHOTS!, 'ai-search-setup-sheet-1280.png') })
})
