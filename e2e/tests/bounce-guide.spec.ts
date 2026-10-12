// The bounce guide: the amber bounce chip on All sites opens the walkthrough (what happened, where, why, fixes), the
// Story shows its note when visitors leave more than usual, and the Features list has it. A site's
// one visit leaves after one page, so the chip is real; the server's judgement is tested in Go and
// given here. BOUNCE_SHOTS=<dir> also takes the pictures.
import { expect, test, type Page } from './fixtures'
import { mkdirSync } from 'node:fs'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.BOUNCE_SHOTS
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

const guide = {
  direction: 'high',
  rate: 0.8,
  usual: 0.5,
  sessions: 420,
  since: '2026-09-20',
  days: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-18', '2026-09-20', '2026-09-22', '2026-09-24'].map((day, i) => ({ day, rate: [0.5, 0.52, 0.48, 0.55, 0.85, 0.82, 0.8][i], sessions: 60 })),
  causes: [
    { kind: 'page', label: '/blog/launch-post', rate: 0.93, share_of_visits: 0.42, was: 0.55 },
    { kind: 'source_device', label: 'Social · Mobile', source: 'Social', device: 'Mobile', rate: 0.91, share_of_visits: 0.3, was: null },
    { kind: 'speed', label: '/blog/launch-post', rate: 0.93, share_of_visits: 0.42, was: 0.55, lcp_ms: 4100 },
  ],
}

// One worker, one site: the tests share it.
test.describe.configure({ mode: 'serial' })

let cookie = ''
let domain = ''
test.beforeAll(async ({ browser }) => {
  cookie = await session('bounce-guide')
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const page = await ctx.newPage()
  domain = `bounce-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const id = ((await made.json()) as { id: string }).id
  expect((await page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: id, k: 'pv', u: `https://${domain}/` } })).ok()).toBe(true)
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites/${id}/events?limit=1`, { headers: H })).json()) as { events: unknown[] }).events.length, { timeout: 15_000 }).toBe(1)
  await ctx.close()
})

async function open(page: Page, path: string, width = 1440) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.route(/\/report\/bounce-guide/, (r) => r.fulfill({ json: guide }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(API + path)
}

async function shoot(page: Page, name: string, schemes: ('dark' | 'light')[]) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  const width = page.viewportSize()!.width
  for (const scheme of schemes) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` })
  }
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Why visitors leave' })

async function walk(page: Page) {
  const d = dialog(page)
  await expect(d.locator('.bg-title')).toHaveText('What happened')
  await expect(d.locator('.bg-rate')).toHaveText('80%')
  await expect(d).toContainText('leave after one page · usual ~50%')
  await expect(d.locator('.bg-chart .ln')).toBeVisible()
  await expect(d).toContainText('since Sep 20')
  await shoot(page, 'step1', ['dark', 'light'])
  await d.getByRole('button', { name: 'Next' }).click()
  await expect(d.locator('.bg-title')).toHaveText('Where they leave')
  await expect(d.locator('.bg-cause')).toHaveCount(3)
  await expect(d).toContainText('Social on Mobile')
  await shoot(page, 'step2', ['dark'])
  await page.keyboard.press('ArrowRight')
  await expect(d.locator('.bg-title')).toHaveText('Why')
  await expect(d.locator('.bg-frame')).toBeVisible()
  await expect(d.locator('.bg-gauge')).toBeVisible()
  await expect(d.locator('.bg-device.phone')).toBeVisible()
  await shoot(page, 'step3', ['dark'])
  await d.getByRole('button', { name: 'Next' }).click()
  await expect(d.locator('.bg-title')).toHaveText('Fix it')
  await expect(d.locator('.bg-fix')).toHaveCount(4)
  await d.getByRole('checkbox', { name: /Open the page like they do/ }).check()
  await shoot(page, 'step4', ['dark', 'light'])
  await page.keyboard.press('ArrowLeft')
  await expect(d.locator('.bg-title')).toHaveText('Why')
  await d.getByRole('button', { name: 'Back' }).click()
  await d.getByRole('button', { name: 'Back' }).click()
  await expect(d.locator('.bg-title')).toHaveText('What happened')
  await d.getByRole('button', { name: 'Next' }).click()
  await d.getByRole('button', { name: 'Next' }).click()
  await d.getByRole('button', { name: 'Next' }).click()
}

test('the chip on All sites opens the walkthrough: four steps, the ticks stay, and See this page', async ({ page }) => {
  await open(page, '/all?layout=cards')
  const item = page.locator('.all-item', { hasText: domain })
  await expect(item).toBeVisible({ timeout: 30_000 })
  await item.locator('[data-bounce-guide]').click()
  await expect(dialog(page)).toBeVisible()
  await walk(page)
  const d = dialog(page)
  await expect(d.getByRole('checkbox', { name: /Open the page like they do/ })).toBeChecked()
  await page.evaluate(() => {
    const opened: unknown[] = ((window as unknown as { opened: unknown[] }).opened = [])
    window.open = (url) => (opened.push(String(url)), null)
  })
  await d.getByRole('button', { name: 'Open', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([`https://${domain}/blog/launch-post`])
  await d.getByRole('button', { name: 'See this page', exact: true }).click()
  await expect(page).toHaveURL(/launch-post/)
})

test('the Story says it, and See why opens the same card', async ({ page }) => {
  await open(page, `/${domain}?view=data&v=story`)
  const card = page.locator('.sv-bounce')
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card).toContainText('8 in 10 leave after one page (usual ~5 in 10)')
  await shoot(page, 'story-card', ['dark', 'light'])
  await card.getByRole('button', { name: 'See why' }).click()
  await expect(dialog(page)).toBeVisible()
})

test('the Features list has the bounce guide', async ({ page }) => {
  await open(page, `/${domain}?view=data&v=story`)
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: /^Features/ }).click()
  const feats = page.getByRole('dialog', { name: 'Features', exact: true })
  await feats.getByRole('searchbox', { name: 'Search features' }).fill('bounce')
  const tile = feats.locator('#feat-bounce')
  await expect(tile).toContainText('Bounce guide')
  await expect(tile).toContainText('Why visitors leave')
  await shoot(page, 'features-tile', ['dark', 'light'])
})

test('on a phone', async ({ page }) => {
  await open(page, '/all?layout=cards', 390)
  const item = page.locator('.all-item', { hasText: domain })
  await expect(item).toBeVisible({ timeout: 30_000 })
  await item.locator('[data-bounce-guide]').click()
  const d = dialog(page)
  await expect(d).toBeVisible()
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  expect(wide).toBe(false)
  for (const [i, name] of ['step1', 'step2', 'step3', 'step4'].entries()) {
    await expect(d).toContainText(`${i + 1} of 4`)
    expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await shoot(page, name, ['dark'])
    if (i < 3) await d.getByRole('button', { name: 'Next' }).click()
  }
  await d.getByRole('button', { name: 'Done' }).click()
  await expect(d).toBeHidden()
  await page.goto(`${API}/${domain}?view=data&v=story`)
  await expect(page.locator('.sv-bounce')).toBeVisible({ timeout: 30_000 })
  await shoot(page, 'story-card', ['light'])
})
