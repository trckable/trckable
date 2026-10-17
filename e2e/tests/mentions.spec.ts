// Where the site is talked about: dots on the chart, a tab on the Sources card, the
// page behind it, its words in Settings, and Live's chip. The server's mentions are faked through
// the route, the way the Down badge fakes the probe.
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import AxeBuilder from '@axe-core/playwright'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const NOW = Math.floor(Date.now() / 1000)

const rules = { topic: ['analytics'], required: [], excluded: [], blocked: [] }
const words = { default: [HISTORY_DOMAIN, 'History'], added: ['Acme Metrics'], max: 10, suggested: ['history'], rules }
const mentions = [
  { id: 3, source: 'hn', url: 'https://news.ycombinator.com/item?id=41000001', title: 'Show HN: Acme Metrics, privacy-friendly analytics', author: 'maker1', host: 'news.ycombinator.com', points: 212, comments: 87, snippet: 'Been looking for something like Acme Metrics for my side projects: no cookies, one script, and it just works.', front: true, posted_at: NOW - 2 * 3600, found_at: NOW - 3600, visitors: 1212, peak_hour: NOW - 3600, driving: true },
  { id: 2, source: 'news', url: 'https://dailybyte.example/acme-launches', title: 'Acme launches a new dashboard', host: 'dailybyte.example', posted_at: NOW - 30 * 3600, found_at: NOW - 29 * 3600, visitors: 38 },
  { id: 1, source: 'ph', url: 'https://www.producthunt.com/posts/acme-metrics', title: 'Acme Metrics: analytics without the creep', author: 'maker1', host: 'producthunt.com', points: 321, posted_at: NOW - 5 * 86400, found_at: NOW - 5 * 86400, visitors: 0 },
]
const answer = (list: unknown[]) => ({ mentions: list, sources: ['hn', 'ph', 'news'], words, driving: list[0] && (list[0] as { driving?: boolean }).driving ? list[0] : null })





test('Live says which mention is sending people right now', async ({ page }) => {
  test.slow()
  await page.context().addCookies([{ name: 'trckable_session', value: await session('mentions-live'), url: API }])
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer(mentions) }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?view=live`)
  await expect(page.locator('.mention-chip')).toContainText('From Hacker News now', { timeout: 20_000 })
  await expect(page.locator('.mention-chip')).toContainText('1,212')
})

// The page behind "All mentions": hero, feed with filters, the detail panel and the empty state.
const hours = (peak: number) => Array.from({ length: 49 }, (_, i) => Math.round(peak * Math.exp(-i / 6) * (i === 0 ? 0.1 : 1)))
const detail = { mention: mentions[0], curve: hours(300), usual: hours(300).map((n) => n + 6), step: 3600, lead: 600, pages: [{ name: '/', visitors: 700 }, { name: '/pricing', visitors: 310 }], countries: [{ name: 'US', visitors: 640 }, { name: 'DE', visitors: 210 }], goals: 41 }

async function seed(page: import('@playwright/test').Page, list: unknown[], who: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session(who), url: API }])
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer(list) }))
  await page.route('**/api/v1/sites/*/mentions/curves*', (r) => r.fulfill({ json: { curves: { 3: hours(300), 2: hours(20) }, step: 3600, lead: 600 } }))
  await page.route('**/api/v1/sites/*/mentions/3', (r) => r.fulfill({ json: detail }))
}

test('the mentions page shows who is talking now, filters the feed and opens one in full', async ({ page }) => {
  test.slow()
  await seed(page, mentions, 'mentions-page')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${API}/${HISTORY_DOMAIN}/mentions`)
  const hero = page.locator('.mp-hero')
  await expect(hero).toContainText('Talked about now', { timeout: 20_000 })
  await expect(hero).toContainText('1,212 visitors so far')
  await expect(hero).toContainText('still coming')
  const feed = page.locator('.mp-feed')
  await expect(feed.locator('.mp-card')).toHaveCount(3)
  await expect(feed.locator('.mp-card').first()).toContainText('Front page')
  await expect(feed.locator('.mp-card').first()).toContainText('by maker1')
  await expect(feed.locator('.mp-card.quiet')).toHaveCount(1) // the launch that brought nobody still shows, quieter
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-page-dark-1440.png` })

  await feed.getByRole('button', { name: 'News & blogs' }).click()
  await expect(feed.locator('.mp-card')).toHaveCount(1)
  await feed.getByRole('button', { name: 'All', exact: true }).click()

  await feed.locator('.mp-card').first().getByRole('button', { name: /Details/ }).click()
  const panel = page.getByRole('dialog', { name: 'Mention details' })
  await expect(panel).toContainText('/pricing')
  await expect(panel).toContainText('41 visitors from it reached a goal')
  await expect(panel.getByRole('link', { name: 'Reply on Hacker News' })).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=41000001')
  expect(page.url()).toContain('?m=3')
  await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-detail-dark-1440.png` })
  const found = (await new AxeBuilder({ page }).exclude('.brand').analyze()).violations
  expect(found.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join()).join(' | ')}`)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.emulateMedia({ colorScheme: 'light' })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-page-light-1440.png` })
})

test('a phone gets the page and the detail as a sheet; with nothing found the page teaches', async ({ page }) => {
  test.slow()
  await seed(page, mentions, 'mentions-phone')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${API}/${HISTORY_DOMAIN}/mentions?m=3`)
  await expect(page.getByRole('dialog', { name: 'Mention details' })).toContainText('/pricing', { timeout: 20_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-detail-light-390.png` })
  await page.getByRole('button', { name: 'Close' }).click()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-page-light-390.png` })

  await page.unroute('**/api/v1/sites/*/mentions?*')
  let saved: string[] | null = null
  await page.route('**/api/v1/sites/*/mentions?*', (r) => r.fulfill({ json: answer([]) }))
  await page.route('**/api/v1/sites/*/mentions/keywords', async (r) => {
    saved = (r.request().postDataJSON() as { keywords: string[] }).keywords
    await r.fulfill({ json: { ...words, added: saved } })
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`${API}/${HISTORY_DOMAIN}/mentions`)
  const empty = page.locator('.mp-empty')
  await expect(empty).toContainText('No mentions yet', { timeout: 20_000 })
  await expect(empty.locator('.mp-sample')).toContainText('sample')
  await expect(empty.locator('.mp-tile')).toHaveCount(3)
  await expect(empty.locator('li.mentions-word')).toHaveCount(3)
  await empty.getByRole('button', { name: 'Add a word' }).click()
  await empty.getByLabel('Word to look for').fill('@acmemetrics')
  await page.keyboard.press('Enter')
  await expect.poll(() => saved).toEqual(['Acme Metrics', '@acmemetrics'])
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-empty-dark-390.png` })
})

// What makes a mention trustworthy: a page the visits confirmed leads with its badge, "Not about us" hides one
// and offers to keep the like of it out, the hidden list brings it back, and the rules are edited in Settings.
const confirmed = { id: 9, source: 'ref', via: 'page', url: 'https://reddit.com/r/saas/comments/abc/best_analytics', title: 'reddit.com/r/saas/comments/abc/best_analytics', host: 'reddit.com', posted_at: NOW - 3 * 86400, found_at: NOW - 3 * 86400, visitors: 41 }
const albas = { id: 8, source: 'news', url: 'https://paper.example/mp-report', title: 'Dan Albas MP Report: a train', host: 'paper.example', posted_at: NOW - 6 * 3600, found_at: NOW - 5 * 3600, visitors: 0 }

test('a confirmed page leads, Not about us hides and offers to keep the like of it out, and the hidden list brings it back', async ({ page }) => {
  test.slow()
  await seed(page, [confirmed, ...mentions, albas], 'mentions-trust')
  let hidden = false
  let ruled: unknown = null
  await page.route('**/api/v1/sites/*/mentions/8/not-about-us', (r) => {
    hidden = true
    return r.fulfill({ json: { hidden: true, suggest_exclude: ['Dan', 'MP', 'Report'], suggest_block: 'paper.example' } })
  })
  await page.route('**/api/v1/sites/*/mentions/rules', async (r) => {
    ruled = r.request().postDataJSON()
    await r.fulfill({ json: ruled })
  })
  await page.route('**/api/v1/sites/*/mentions/hidden', (r) => r.fulfill({ json: { mentions: hidden ? [albas] : [] } }))
  await page.route('**/api/v1/sites/*/mentions/8/restore', (r) => {
    hidden = false
    return r.fulfill({ json: { hidden: false } })
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto(`${API}/${HISTORY_DOMAIN}/mentions`)
  const feed = page.locator('.mp-feed')
  await expect(feed.locator('.mp-card').first()).toContainText('Confirmed · 41 visits', { timeout: 20_000 })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-trust-dark-1440.png` })
  await feed.locator('.mp-card', { hasText: 'Dan Albas' }).getByRole('button', { name: 'Not about us' }).click()
  const note = page.locator('.mp-note')
  await expect(note).toContainText('Hidden. It will not come back.')
  await expect(note.getByRole('button', { name: 'Exclude “Dan”' })).toBeVisible()
  await expect(note.getByRole('button', { name: 'Block paper.example' })).toBeVisible()
  await note.getByRole('button', { name: 'Exclude “MP”' }).click()
  await expect.poll(() => ruled).toMatchObject({ excluded: ['MP'] })
  await expect(note).toBeHidden()
  await expect(page.locator('.mp-hidden summary')).toHaveText('Hidden · 1')
  await page.locator('.mp-hidden summary').click()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-hidden-dark-1440.png` })
  await page.getByRole('button', { name: /Restore: / }).click()
  await expect(page.locator('.mp-hidden')).toBeHidden()
  await page.emulateMedia({ colorScheme: 'light' })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-trust-light-1440.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await feed.locator('.mp-card').first().scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-trust-light-390.png` })
  await page.emulateMedia({ colorScheme: 'dark' })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-trust-dark-390.png` })
})

test('Settings: a new name is checked against the news, and the rules are edited and saved', async ({ page }) => {
  test.slow()
  await seed(page, mentions, 'mentions-rules')
  const site = ((await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; domain: string }[] }).sites.find((s) => s.domain === HISTORY_DOMAIN)!
  let saved: unknown = null
  await page.route('**/api/v1/sites/*/mentions/lookalike*', (r) => r.fulfill({ json: { word: 'albas', checked: true, elsewhere: 2, examples: ['Dan Albas MP Report: a train', 'MP Dan Albas on the budget'], suggest_exclude: ['Dan', 'MP'] } }))
  await page.route('**/api/v1/sites/*/mentions/rules', async (r) => {
    saved = r.request().postDataJSON()
    await r.fulfill({ json: saved })
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1440, height: 1500 })
  await page.goto(`${API}/settings?site=${site.id}&tab=mentions`)
  const card = page.locator('.mentions-set')
  await expect(card).toContainText('What counts as a mention', { timeout: 20_000 })
  await card.getByLabel('Word to search for').fill('albas')
  await card.getByRole('button', { name: 'Add a word' }).click()
  const warn = card.locator('.mp-note')
  await expect(warn).toContainText('“albas” is also used for something else in the news')
  await expect(warn).toContainText('Dan Albas MP Report: a train')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-rules-dark-1440.png` })
  await warn.getByRole('button', { name: /Add it and exclude/ }).click()
  await expect(card.locator('li.mentions-word', { hasText: 'albas' })).toHaveCount(1)
  await card.getByRole('button', { name: 'Save rules' }).click()
  await expect.poll(() => saved).toMatchObject({ topic: ['analytics'], excluded: ['Dan', 'MP'] })
  await page.emulateMedia({ colorScheme: 'light' })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-rules-light-1440.png` })
  await page.setViewportSize({ width: 390, height: 1800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-rules-light-390.png` })
  await page.emulateMedia({ colorScheme: 'dark' })
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mentions-rules-dark-390.png` })
})
