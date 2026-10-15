// The Verified seal: a small seal on the site's avatar, its panel (one row per
// independent kind: Payments, Search; trckable's own snippet is no source), the badges that
// name the source behind a card, the seal in the site switcher, the shared page
// (money counts only on a link that shows money) and the website badge. Run at
// 1440 and at 390 (VERIFIED_WIDTH); VERIFIED_SHOTS=<dir> also takes the pictures,
// light and dark. The server's own rules are tested in Go; here a page is told
// what the server could say (route), apart from Stripe, which is real: connected
// with a signed sale, so the shared page and the badge read it from the server.
import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, signIn, type TestSite } from './audit-kit'
import { sources, stripeSale, type Source } from './verified-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')
test.describe.configure({ mode: 'serial' })

const SHOTS = process.env.VERIFIED_SHOTS
const WIDTH = Number(process.env.VERIFIED_WIDTH ?? 1440)
const phone = WIDTH < 640

let site: TestSite
let openLink = ''
let moneyLink = ''

const ALL = sources([{ kind: 'gsc', checked: Math.floor(Date.now() / 1000) - 7200 }, { kind: 'payments', provider: 'stripe' }])

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext()).newPage()
  site = await newSite(page, 'verified')
  await stripeSale(page.request, site.id)
  const link = async (revenue: boolean) => {
    const made = await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data: { name: revenue ? 'with money' : 'open', revenue } })
    expect(made.ok()).toBe(true)
    return ((await made.json()) as { url: string }).url
  }
  openLink = await link(false)
  moneyLink = await link(true)
  await page.context().close()
})

/** Tells the page what the server could say for this site: the sites list and the panel's own read. */
async function told(page: Page, list: Source[]) {
  await page.route('**/api/v1/sites', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const res = await route.fetch()
    const body = (await res.json()) as { sites: { id: string }[] }
    body.sites = body.sites.map((s) => (s.id === site.id ? { ...s, verified: { sources: list } } : s))
    return route.fulfill({ response: res, json: body })
  })
  await page.route(`**/api/v1/sites/${site.id}/verified`, (route) => route.fulfill({ json: { sources: list } }))
}

async function open(page: Page, path: string) {
  await signIn(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: WIDTH, height: 900 })
  await page.goto(API + path)
}

async function shoot(page: Page, name: string, clip?: { x?: number; y?: number; width?: number; height?: number }) {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/verified-${name}-${WIDTH}-${scheme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 420, ...clip } })
  }
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

test('the seal is a check after the site name, and its panel lists a row per kind of badge', async ({ page }) => {
  await told(page, ALL)
  await open(page, `/${site.domain}?v=explore`)
  const seal = page.locator('.site-zone .vf-sealbtn')
  await expect(seal).toBeVisible({ timeout: 15_000 })
  await expect(seal).toHaveAttribute('title', 'Verified · Payments, Search')
  await expect(page.locator('.vf-pill')).toHaveCount(0)
  const at = async (sel: string) => (await page.locator(sel).first().boundingBox())!
  expect((await at('.site-zone .vf-sealbtn')).x, 'the check comes after the name').toBeGreaterThan((await at('.site-pick .site-btn .name')).x)
  await expect(page.locator('.site-pick .site-btn .vf-sealbtn, .site-pick .site-btn .state-dot')).toHaveCount(0) // the avatar is clean
  expect(await noSideScroll(page), 'the header scrolls sideways').toBeLessThanOrEqual(0)
  await shoot(page, 'seal', { height: 120 })

  await seal.click()
  const panel = page.locator('.vf-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.vf-row')).toHaveCount(2)
  await expect(panel).toContainText('Verified · Payments, Search')
  await expect(panel).toContainText('Search')
  await expect(panel).toContainText('Payments')
  await expect(panel).not.toContainText('trckable on the site')
  await expect(panel.locator('.vf-connect')).toHaveCount(0)
  await expect(panel.locator('.vf-foot')).toContainText('Last checked')
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0)
  await shoot(page, 'panel', { height: phone ? 900 : 480 })

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(seal).toBeFocused()
})

test('a kind not earned yet is a Connect row that opens Settings', async ({ page }) => {
  await told(page, sources([{ kind: 'payments', provider: 'stripe' }]))
  await open(page, `/${site.domain}?v=explore`)
  await page.locator('.site-zone .vf-sealbtn').click({ timeout: 15_000 })
  const panel = page.locator('.vf-panel')
  await expect(panel.locator('.vf-row')).toHaveCount(1)
  await expect(panel.locator('.vf-connect')).toHaveCount(1)
  await expect(panel.locator('.vf-connect')).toContainText('Search')
  await panel.locator('.vf-connect').click()
  await expect(page.getByRole('dialog').first()).toBeVisible()
})

test('the Revenue number names its source; a source that fails drops its badge and the seal', async ({ page }) => {
  await told(page, ALL)
  await open(page, `/${site.domain}?v=explore`)
  const tile = (name: string) => page.locator('.kpis .kpi').filter({ hasText: name }).first()
  await expect(tile('Revenue').locator('.vf-chip')).toContainText('Payments verified', { timeout: 15_000 })
  // trckable's own snippet is no source: Visitors carries no badge.
  await expect(tile('Visitors').locator('.vf-chip')).toHaveCount(0)
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0)
  await shoot(page, 'chips', { y: 60, height: 300 })

  const failing = ALL.map((s) => (s.kind === 'payments' ? { ...s, ok: false } : s))
  await page.unroute('**/api/v1/sites')
  await page.unroute(`**/api/v1/sites/${site.id}/verified`)
  await told(page, failing)
  await page.reload()
  await expect(page.locator('.site-zone .vf-sealbtn')).toHaveAttribute('title', 'Verified · Search', { timeout: 15_000 })
  await expect(tile('Revenue').locator('.vf-chip')).toHaveCount(0)
})

test('the Story cards carry the same badges', async ({ page }) => {
  await told(page, ALL)
  await open(page, `/${site.domain}?v=story`)
  await expect(page.locator('.sv-tile .vf-chip').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.sv-tile .vf-chip')).toHaveCount(1)
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0)
  await shoot(page, 'story', { y: 120, height: 560 })
})

test('with nothing working there is no seal and no badge, and the switcher marks only a site that has one', async ({ page }) => {
  await told(page, sources([{ kind: 'payments', provider: 'stripe', ok: false }]))
  await open(page, `/${site.domain}?v=explore`)
  await expect(page.locator('.site-pick')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.vf-sealbtn')).toHaveCount(0)
  await expect(page.locator('.kpis .vf-chip')).toHaveCount(0)

  await page.unroute('**/api/v1/sites')
  await page.unroute(`**/api/v1/sites/${site.id}/verified`)
  await told(page, ALL)
  await page.reload()
  await page.locator('.site-pick .site-btn').click()
  await expect(page.locator(`[data-site="${site.id}"] .vf-seal-dot`)).toBeVisible({ timeout: 15_000 })
  // A site with no source has no seal (other suites' sites with a real Stripe sale may have one).
  await expect(page.locator('.pop.sites .site-row').filter({ hasText: 'history.example' }).locator('.vf-seal-dot')).toHaveCount(0)
  await shoot(page, 'switcher', { height: 520 })
})

test('a shared link shows the seal for its readers, and money only on a link that shows money', async ({ page }) => {
  await page.setViewportSize({ width: WIDTH, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Stripe is the one real source here, and the open link hides money.
  await page.goto(openLink)
  await expect(page.locator('.app.shared')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.vf-pill')).toHaveCount(0)

  await page.goto(moneyLink)
  const pill = page.locator('.vf-pill')
  await expect(pill).toBeVisible({ timeout: 15_000 })
  await expect(pill).toHaveAttribute('aria-label', /Payments/)
  await pill.click()
  const panel = page.locator('.vf-panel')
  await expect(panel).toContainText('These numbers are real')
  await expect(panel).toContainText('Confirmed by an independent source: Payments')
  await expect(panel.locator('.vf-connect')).toHaveCount(0)
  await expect(panel.getByRole('link', { name: /Verify your own site/ })).toHaveAttribute('href', 'https://trckable.com/?ref=verified')
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0)
  await shoot(page, 'shared', { height: phone ? 900 : 520 })
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(page.locator('.kpis .kpi').filter({ hasText: 'Revenue' }).locator('.vf-chip')).toContainText('Payments verified')
})

test('the website badge shows what works, and nothing while no source does', async ({ page }) => {
  await signIn(page)
  const make = async (id: string, shows: string[] = []) => {
    const made = await page.request.post(`${API}/api/v1/sites/${id}/widgets`, { headers: H, data: { kind: 'verified', theme: 'dark', on: true, shows } })
    expect(made.ok(), await made.text()).toBe(true)
    const wid = ((await made.json()) as { id: string }).id
    await page.request.put(`${API}/api/v1/sites/${id}/widgets/${wid}`, { headers: H, data: { kind: 'verified', theme: 'dark', on: true, shows } })
    return wid
  }
  // The real Stripe source. With no choice the badge leads to trckable.com, and says "Payments verified", never the provider.
  const wid = await make(site.id)
  await page.setViewportSize({ width: WIDTH, height: 300 })
  await page.goto(`${API}/w/${wid}`)
  const card = page.locator('a.card')
  await expect(card).toContainText('Verified by trckable')
  await expect(card).toHaveAttribute('href', 'https://trckable.com/?ref=verified')
  await expect(card.locator('i')).toHaveCount(1)
  await expect(card.locator('i')).toHaveAttribute('aria-label', 'Payments verified')
  // An open link the owner chose is followed; one with money in it never is.
  const list = ((await (await page.request.get(`${API}/api/v1/sites/${site.id}/shares`, { headers: H })).json()) as { shares: { id: string; name: string }[] }).shares
  const chosen = async (name: string) => {
    await page.goto(`${API}/w/${await make(site.id, [`link:${list.find((x) => x.name === name)!.id}`])}`)
    return page.locator('a.card').getAttribute('href')
  }
  expect(await chosen('open')).toBe(openLink)
  expect(await chosen('with money')).toBe('https://trckable.com/?ref=verified')
  await page.goto(`${API}/w/${wid}`)
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0)
  await shoot(page, 'badge', { height: 120 })

  // A site with no source at all: a quiet empty page.
  const bare = await newSite(page, 'verified-bare', false)
  const empty = await make(bare.id)
  await page.goto(`${API}/w/${empty}`)
  await expect(page.locator('.card')).toHaveCount(0)
  await expect(page.locator('body')).toHaveText('')
})

test('Settings → Widgets offers the Verified badge', async ({ page }) => {
  await open(page, `/settings?site=${site.id}&tab=widgets`)
  await page.getByRole('button', { name: 'New widget' }).first().click()
  const studio = page.getByRole('dialog', { name: 'New widget' })
  await studio.getByRole('radio', { name: /Verified badge/ }).click()
  // The brand line is the badge's own words, so there is nothing to switch off.
  await expect(studio.getByText('Brand', { exact: true })).toHaveCount(0)
  await expect(studio.locator('iframe').first()).toBeVisible()
})
