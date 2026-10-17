// What the Briefing keeps from the old Data page, each in its place on the new one: the moments' markers over the
// chart (and the search list that puts the sources' markers away), the mentions' dots, the busy moment's band and
// line, the guide to leaving after one page, a long period played as a story, the card seals, Google's lines in AI
// & search, a note's flag on the chart, and a goal made in the dialog. The server's own findings are given through
// the routes, as the Down badge gives its probe.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'
import { newSite } from './audit-kit'
import { stripeSale } from './verified-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the page is the same')

const NOW = Math.floor(Date.now() / 1000)
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('restored')
})

async function open(page: Page, query: string, width = 1440) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`${API}/${HISTORY_DOMAIN}${query}`)
}

/** The sites list says things about the site (mentions on, verified sources) for the page that reads it. */
async function told(page: Page, patch: Record<string, unknown>) {
  await page.route('**/api/v1/sites', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback()
    const res = await r.fetch()
    const body = (await res.json()) as { sites: { domain: string }[] }
    body.sites = body.sites.map((s) => (s.domain === HISTORY_DOMAIN ? { ...s, ...patch } : s))
    await r.fulfill({ response: res, json: body })
  })
}

test('a moment is a marker over the chart: it says itself on pointing and opens its card on a click', async ({ page }) => {
  await page.route(/\/moments\?/, (r) => r.fulfill({ json: { moments: [{ t: `${day(3)}T00:00`, kind: 'spike', factor: 3.2, referrer: 'news.ycombinator.com', visitors: 120 }] } }))
  await open(page, '?view=briefing&period=30d')
  const mark = page.locator('.chlay .moment-mark').first()
  await expect(mark).toBeVisible({ timeout: 20_000 })
  await mark.hover()
  await expect(page.getByRole('tooltip')).toContainText(/Hacker News|news\.ycombinator/)
  await mark.click()
  await expect(page.getByRole('button', { name: 'See it' })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'See it' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('the search list puts the sources and links markers away, and brings them back', async ({ page }) => {
  await open(page, '?view=briefing&period=30d')
  await expect(page.locator('.chlay')).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('ControlOrMeta+k')
  const find = page.locator('.pal.on .palbox input')
  await find.fill('Sources and links on the chart')
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => localStorage.getItem('trckable:markers'))).toBe('off')
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.pal.on .palbox input').fill('Sources and links on the chart')
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => localStorage.getItem('trckable:markers'))).toBe('on')
})

test('a mention is a dot over the chart, with its source and what it brought', async ({ page }) => {
  const posted = Math.floor(Date.now() / 86400_000) * 86400 - 2 * 86400 + 12 * 3600
  const mention = { id: 7, source: 'hn', url: 'https://news.ycombinator.com/item?id=41000001', title: 'Show HN: Acme Metrics', author: 'maker1', host: 'news.ycombinator.com', points: 212, comments: 87, snippet: 'It just works.', front: true, posted_at: posted, found_at: posted + 600, visitors: 1212, peak_hour: posted + 3600, driving: false }
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: { mentions: [mention], sources: ['hn'], words: { default: [HISTORY_DOMAIN], added: [], max: 10 }, driving: null } }))
  await told(page, { mentions: true })
  await open(page, '?view=briefing&period=7d')
  const dot = page.locator('.chlay .mp-pin').first()
  await expect(dot).toBeVisible({ timeout: 20_000 })
  await dot.hover()
  await expect(page.getByRole('tooltip')).toContainText('visitors')
  await expect(dot.locator('.mention-mark')).toHaveAttribute('data-source', 'hn')
})

test('the chart header says how many mentions the period has, lights their dots, and opens the Mentions page', async ({ page }) => {
  const posted = Math.floor(Date.now() / 86400_000) * 86400 - 2 * 86400 + 12 * 3600
  const mention = { id: 8, source: 'hn', url: 'https://news.ycombinator.com/item?id=41000002', title: 'Show HN: Acme Metrics', author: 'maker1', host: 'news.ycombinator.com', points: 90, comments: 12, snippet: 'It just works.', front: false, posted_at: posted, found_at: posted + 600, visitors: 300, peak_hour: posted + 3600, driving: false }
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: { mentions: [mention], sources: ['hn'], words: { default: [HISTORY_DOMAIN], added: [], max: 10 }, driving: null } }))
  await told(page, { mentions: true })
  await open(page, '?view=briefing&period=7d')
  const chip = page.locator('.mp-chip')
  await expect(chip).toBeVisible({ timeout: 20_000 })
  await expect(chip).toContainText('1')
  await chip.click()
  await expect(page).toHaveURL(new RegExp(`/${HISTORY_DOMAIN.replace('.', '\\.')}/mentions`))
})

test('a busy moment opens the page with its line over the Briefing and its band on the chart', async ({ page }) => {
  const started = NOW - 3 * 86400
  const surge = { id: 'sg_1', started, ended: started + 1500, online: 60, usual: 8, times: 7, why: { source: 'Hacker News', source_dim: 'referrer', source_value: 'news.ycombinator.com', source_n: 40, source_usual: 1, page: '/blog/launch', page_n: 31, before: 4, minutes: 25 } }
  await page.route(/\/surges\/near/, (r) => r.fulfill({ json: { surge } }))
  await open(page, `?view=briefing&period=7d&sg=${started}`)
  await expect(page.locator('.surge-banner')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.chlay .surge-band, .chlay [class*="surge"]').first()).toBeVisible()
})

test('visitors who leave after one page: a line on the Briefing opens the guide, and the search list does too', async ({ page }) => {
  const guide = {
    direction: 'high',
    rate: 0.8,
    usual: 0.5,
    sessions: 420,
    since: day(8),
    days: [14, 12, 10, 8, 6, 4, 2].map((n, i) => ({ day: day(n), rate: [0.5, 0.52, 0.48, 0.55, 0.85, 0.82, 0.8][i], sessions: 60 })),
    causes: [{ kind: 'page', label: '/blog/launch-post', rate: 0.93, share_of_visits: 0.42, was: 0.55 }],
  }
  await page.route(/\/report\/bounce-guide/, (r) => r.fulfill({ json: guide }))
  await open(page, '?view=briefing&period=30d')
  await page.getByRole('button', { name: 'See why' }).click()
  const dialog = page.getByRole('dialog', { name: 'Why visitors leave' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('What happened')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.pal.on .palbox input').fill('Why visitors leave')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
})

test('a long period plays as a story: its moments come as the playhead passes them, and a card sums it up', async ({ page }) => {
  await page.route(/\/moments\?/, (r) => r.fulfill({ json: { moments: [{ t: `${day(3)}T00:00`, kind: 'spike', factor: 3.2, referrer: 'news.ycombinator.com', visitors: 120 }] } }))
  await open(page, '?view=briefing&period=30d')
  await page.locator('[data-replay]').click()
  await expect(page.locator('.story-rail')).toBeVisible()
  await expect(page.locator('.story-dot').first()).toBeVisible()
  await expect(page.locator('.story-end')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.story-end')).toContainText('visitors')
  await page.getByRole('button', { name: 'Replay again' }).click()
  await expect(page.locator('.story-rail')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.story, .story-end')).toHaveCount(0)
})

test('a card that rests on a source wears its seal in Explore', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const site = await newSite(page, 'seal')
  await stripeSale(page.request, site.id)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${API}/${site.domain}?view=briefing&period=30d&x=sales`)
  await expect(page.locator('#xp .vf-chip')).toContainText('Payments verified', { timeout: 20_000 })
})

test('AI & search keeps Google beside the assistants and the crawlers', async ({ page }) => {
  await page.route('**/api/v1/sites/*/search-console', (r) => r.fulfill({ json: { connected: true, connection: { property: `sc-domain:${HISTORY_DOMAIN}` } } }))
  await page.route(/\/report\/search\?/, (r) => r.fulfill({ json: { property: `sc-domain:${HISTORY_DOMAIN}`, dim: 'query', rows: [{ key: 'privacy analytics', clicks: 42, impressions: 900, ctr: 0.047, position: 5.1 }, { key: 'trckable', clicks: 30, impressions: 300, ctr: 0.1, position: 1.2 }], from: day(30), to: day(0), clicks: 72, impressions: 1200 } }))
  await open(page, '?view=briefing&period=30d&x=ai')
  const panel = page.locator('#xp.on')
  await expect(panel.getByText('privacy analytics')).toBeVisible({ timeout: 20_000 })
  await expect(panel).toContainText('Google')
  await expect(panel).toContainText('AI assistants')
})

test('a note is a flag on the chart, with its words', async ({ page }) => {
  const sites = (await (await page.request.get(`${API}/api/v1/sites`, { headers: { cookie: `trckable_session=${cookie}` } })).json()) as { sites: { id: string; domain: string }[] }
  const id = sites.sites.find((s) => s.domain === HISTORY_DOMAIN)!.id
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const text = `Launch post ${Date.now()}`
  const made = await page.request.post(`${API}/api/v1/sites/${id}/annotations`, { headers: H, data: { day: day(2), text } })
  expect(made.status()).toBe(201)
  await open(page, '?view=briefing&period=7d')
  await expect(page.locator(`svg#chart path[fill="#f0c64a"] title`).filter({ hasText: text })).toHaveCount(1, { timeout: 20_000 })
})
