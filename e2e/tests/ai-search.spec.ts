// AI & Search in Explore: the section opens, each part says in one line what it is, Google's part says what connecting it
// brings (Search Console is not connected here), and the assistants' tiles and the crawlers' and pages' lists carry what the
// site saw: the assistants are visits with their referrers (ai.example in playwright.config.ts), the crawlers are posted to
// /api/crawl the way a site's own server does it, with the site's proxy key.
import { existsSync, openSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from './fixtures'
import { flowSession } from './flows-kit'
import { AI_DOMAIN, API } from '../playwright.config'

let cookie = ''

const UA = (bot: string) => `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ${bot}; +https://example.com/bot)`
// Who read what: two training crawlers and two answering ones, one of them refused once.
const CRAWLS = [
  { bot: 'GPTBot/1.2', path: '/pricing', times: 3 },
  { bot: 'GPTBot/1.2', path: '/guide', times: 2 },
  { bot: 'ClaudeBot/1.0', path: '/pricing', times: 2 },
  { bot: 'PerplexityBot/1.0', path: '/guide', times: 1 },
  { bot: 'ChatGPT-User/1.0', path: '/guide', times: 1 },
  { bot: 'ClaudeBot/1.0', path: '/private', times: 1, status: 403 },
]

test.beforeAll(async () => {
  cookie = await flowSession()
  // Every worker runs this: the first one posts the hits, the others wait for it (a hit counted twice would change every number).
  const mark = join(process.env.TRCKABLE_DATA_DIR!, 'ai-crawls')
  try {
    openSync(mark + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(mark); i++) await new Promise((r) => setTimeout(r, 100))
    return
  }
  const sites = (await (await fetch(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })).json()) as { sites: { id: string; domain: string; proxy_key: string }[] }
  const site = sites.sites.find((s) => s.domain === AI_DOMAIN)!
  for (const c of CRAWLS) {
    for (let i = 0; i < c.times; i++) {
      // The same robot asking for the same page in the same second is one hit: a repeat waits for the next second.
      if (i > 0) await new Promise((r) => setTimeout(r, 1100))
      const res = await fetch(`${API}/api/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Trckable-Proxy-Key': site.proxy_key },
        body: JSON.stringify({ s: site.id, u: `https://${AI_DOMAIN}${c.path}?n=${i}`, ua: UA(c.bot), st: c.status ?? 200 }),
      })
      expect(res.status, `${c.bot} ${c.path}`).toBe(202)
    }
  }
  writeFileSync(mark, 'done')
})

async function open(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${AI_DOMAIN}?view=briefing&period=30d&x=ai`)
  const card = page.locator('#xp [data-xcard="ai"]')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card.locator('.xai-tile').first()).toBeVisible({ timeout: 20_000 })
  return card
}

for (const width of [1440, 390]) {
  test(`AI & Search opens and says what each part is, ${width}px`, async ({ page }) => {
    const card = await open(page, width)
    await expect(card).not.toContainText('Couldn’t read AI & Search')
    // One plain line under each section's heading.
    const sections = [
      ['AI assistants', 'People who clicked a link to you inside an AI assistant’s answer.'],
      ['Google', 'The Google searches that brought people to you, by clicks.'],
      ['Crawlers', 'AI bots that read your pages to learn about you, and how often.'],
      ['Pages', 'Which pages AI bots read, and how many visits each one then sent.'],
    ] as const
    for (const [title, line] of sections) {
      const head = card.locator('.xsec', { hasText: title }).first()
      await expect(head, title).toBeVisible()
      await expect(head.locator('xpath=following-sibling::div[contains(@class,"xnote")][1]'), title).toContainText(line)
    }
  })
}

test('Google not connected says what connecting it brings, and offers the way', async ({ page }) => {
  const card = await open(page)
  const empty = card.locator('.xempty', { hasText: 'Connect Search Console' })
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('Then this shows the Google searches that brought people to you.')
  await expect(empty.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()
})

test('the assistants that sent people are tiles, biggest first, with bars in proportion', async ({ page }) => {
  const card = await open(page)
  const tiles = card.locator('.xai-tile')
  await expect(tiles.first()).toContainText(/ChatGPT\s*14/)
  await expect(tiles.nth(1)).toContainText(/Claude\s*5/)
  await expect(tiles.nth(2)).toContainText(/Perplexity\s*3/)
  const widths = await tiles.locator('u').evaluateAll((els) => els.map((e) => (e as HTMLElement).getBoundingClientRect().width))
  expect(widths[0]).toBeGreaterThan(widths[1])
  expect(widths[1]).toBeGreaterThan(widths[2])
})

test('the crawlers are listed with their hits, what was refused, and the pages they read', async ({ page }) => {
  const card = await open(page)
  const crawlers = card.locator('.xsec', { hasText: 'Crawlers' }).first()
  await expect(crawlers).toContainText('10') // 3 + 2 + 2 + 1 + 1 + 1 hits in all
  const rows = card.locator('.xt', { has: page.getByText('Blocked / failed') }).locator('.xrw')
  await expect(rows.filter({ hasText: /^OpenAI · training/ })).toContainText('5')
  const claude = rows.filter({ hasText: /^Anthropic · training/ })
  await expect(claude).toContainText('3')
  await expect(claude).toContainText('1') // the one refused
  await expect(rows.filter({ hasText: /^Perplexity · answers/ })).toBeVisible()
  // The pages they read: the reads, then the visits AI sent (ChatGPT, Claude and Perplexity: 10 to /pricing, 12 to /guide).
  const pages = card.locator('.xt', { has: page.getByText('AI reads') }).locator('.xrw')
  await expect(pages).toHaveCount(3)
  await expect(pages.filter({ hasText: '/pricing' })).toHaveText(/\/pricing\s*5\s*10/)
  await expect(pages.filter({ hasText: '/guide' })).toHaveText(/\/guide\s*4\s*12/)
  await expect(pages.filter({ hasText: '/private' })).toHaveText(/\/private\s*1\s*0/) // asked for once, refused, and nobody came from it
})

test('a page row filters the dashboard to that page', async ({ page }) => {
  const card = await open(page)
  await card.locator('.xrw', { hasText: '/pricing' }).click()
  await expect(page).toHaveURL(/xf=page/)
})
