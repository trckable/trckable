// The bounce guide: the Story shows its note when visitors leave more than usual, and the Features list has it. A site's
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


test('the Features list has the bounce guide', async ({ page }) => {
  await open(page, `/${domain}?view=briefing`)
  // The avatar menu no longer holds Features: ⌘K finds it.
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.locator('.pal.on .palbox input')).toBeVisible() // the list is its own chunk
  await page.locator('.pal.on .palbox input').fill('Features')
  await page.keyboard.press('Enter')
  const feats = page.getByRole('dialog', { name: 'Features', exact: true })
  await feats.getByRole('searchbox', { name: 'Search features' }).fill('bounce')
  const tile = feats.locator('#feat-bounce')
  await expect(tile).toContainText('Bounce guide')
  await expect(tile).toContainText('Why visitors leave')
  await shoot(page, 'features-tile', ['dark', 'light'])
})

