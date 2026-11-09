// AI & Search in Explore: the section opens, each part says in one line what it is, Google's part says what connecting it
// brings (Search Console is not connected here), and the headline, the assistants' rows and the crawlers' and pages' lists carry what the
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

async function open(page: Page, width = 1440, domain = AI_DOMAIN) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${domain}?view=briefing&period=30d&x=ai`)
  const card = page.locator('#xp [data-xcard="ai"]')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card.locator('[data-sum="sent"]')).toBeVisible({ timeout: 20_000 })
  return card
}

for (const width of [1440, 390]) {
  test(`AI & Search opens and says what each part is, ${width}px`, async ({ page }) => {
    const card = await open(page, width)
    await expect(card).not.toContainText('Couldn’t read AI & Search')
    // One plain line under each section's heading.
    const sections = [
      ['Assistants: what they read, what they send', 'Fetches are what the assistant’s robots read of your site. Visitors are people who clicked a link to you in its answers.'],
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

test('the headline says what AI reads against the people who come, and the busiest company', async ({ page }) => {
  const card = await open(page)
  // 10 AI hits in all (3 + 2 + 2 + 1 + 1 + 1), OpenAI the busiest with 6.
  await expect(card.locator('[data-sum="requests"]')).toContainText('10')
  await expect(card.locator('[data-sum="per"]')).toContainText('×')
  await expect(card.locator('[data-sum="top"]')).toContainText('OpenAI')
  await expect(card.locator('[data-sum="top"]')).toContainText('6 requests')
  await expect(card.locator('[data-sum="sent"]')).toContainText('22') // ChatGPT 14, Claude 5, Perplexity 3
})

test('each assistant shows what its robots read against the people it sent, biggest first', async ({ page }) => {
  const card = await open(page)
  const table = card.locator('.xt', { has: page.getByText('Fetches', { exact: true }) })
  const rows = table.locator('.xrw')
  await expect(rows.first()).toContainText(/ChatGPT/)
  await expect(rows.first()).toContainText('1 visitor per 1 fetch') // 6 reads, 14 people: never "per 0"
  await expect(rows.first()).toHaveText(/6\s*14$/)
  await expect(rows.nth(1)).toContainText(/Claude/)
  await expect(rows.nth(1)).toHaveText(/3\s*5$/)
  await expect(rows.nth(2)).toContainText(/Perplexity/)
  await expect(rows.nth(2)).toHaveText(/1\s*3$/)
})

test('How to improve names what the numbers show, with one action each', async ({ page }) => {
  const card = await open(page)
  const tips = card.locator('[data-ai-tips] [data-tip]')
  // The refused request is too few to be a finding; nothing here is broken or ignored enough to say, so the list may be empty.
  await expect(card.locator('[data-tip="blocked"]')).toHaveCount(0)
  const n = await tips.count()
  expect(n).toBeLessThanOrEqual(3)
  for (let i = 0; i < n; i++) await expect(tips.nth(i).getByRole('button')).toHaveCount(1)
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

test('without crawler data only the visitors show, and the one tip is to connect it', async ({ page }) => {
  // example.com has had no crawler reported: nothing to compare the visitors with, so no zeros are drawn.
  const card = await open(page, 1440, 'example.com')
  await expect(card.locator('[data-sum="sent"]')).toBeVisible()
  await expect(card.locator('[data-sum="requests"]')).toHaveCount(0)
  await expect(card.locator('[data-sum="per"]')).toHaveCount(0)
  const tips = card.locator('[data-ai-tips] [data-tip]')
  await expect(tips).toHaveCount(1)
  await expect(tips.first()).toHaveAttribute('data-tip', 'connect')
  await tips.first().getByRole('button', { name: 'Connect crawler data' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
