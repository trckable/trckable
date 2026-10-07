// AI & Search, against a trckabled with the demo data (skipped unless
// TRCKABLE_A11Y_URL points at one):
//   TRCKABLE_A11Y_URL=http://localhost:8799 npx playwright test ai-search --project=chromium --workers=1
// One tab in Who came with three columns, a click that filters, the setup
// sheet from the crawler column, and (with TRCKABLE_SHOTS) the pictures.
import { expect, test, type Page } from './fixtures'
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
  await expect(sheet.getByText('Step 1 of 3')).toBeVisible()
  await sheet.getByRole('button', { name: /Cloudflare/ }).click()
  await expect(sheet.getByText('Step 2 of 3')).toBeVisible()
  await expect(sheet.locator('pre.code').first()).toContainText('waitUntil')
  await expect(sheet.locator('pre.code').first()).toContainText(site.id)
  await expect(sheet.getByRole('button', { name: 'Copy the code' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Copy key' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Show all' }).click()
  await expect(sheet.getByRole('button', { name: 'Show less' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Back' }).click()
  await sheet.getByRole('button', { name: /Nginx/ }).click()
  await expect(sheet.locator('pre.code')).toHaveCount(2)
  await sheet.getByRole('button', { name: 'Back' }).click()
  await sheet.getByRole('button', { name: /Caddy/ }).click()
  await expect(sheet.locator('pre.code').first()).toContainText('jq -c --unbuffered')
  expect(await sheet.innerText()).not.toMatch(/cookie|x-forwarded|remote_addr/i)
  await sheet.getByRole('button', { name: 'I’ve added it' }).click()
  await expect(sheet.getByText('Step 3 of 3')).toBeVisible()
  await expect(sheet.getByRole('status')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})

test('Connect crawler data on a phone: the footer fits, nothing scrolls sideways, buttons are 44px', async ({ page }) => {
  await open(page, 390)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const scheme of ['dark', 'light']) {
    await page.evaluate((s) => document.documentElement.setAttribute('data-theme', s), scheme)
    await page.locator('[data-card=who]').getByRole('tab', { name: 'Crawlers', exact: true }).click()
    await page.getByRole('button', { name: 'How to feed this' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('button', { name: /Cloudflare/ }).click()
    for (const step of [2, 3]) {
      if (step === 3) await sheet.getByRole('button', { name: 'I’ve added it' }).click()
      await expect(sheet.getByText(`Step ${step} of 3`)).toBeVisible()
      const boxes = await sheet.locator('.dialog-actions').locator('> *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
      for (const b of boxes) expect(b.height, `${scheme} step ${step}`).toBeGreaterThanOrEqual(24)
      for (const b of await sheet.locator('.dialog-actions > .btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(b).toBeGreaterThanOrEqual(44)
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const c = boxes[j]
          const apart = a.right <= c.left + 0.5 || c.right <= a.left + 0.5 || a.bottom <= c.top + 0.5 || c.bottom <= a.top + 0.5
          expect(apart, `${scheme} step ${step}: footer items ${i} and ${j} overlap`).toBe(true)
        }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await sheet.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true)
      for (const h of await sheet.locator('.cs-body .btn, .cs-body .cs-link').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44)
    }
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  }
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
