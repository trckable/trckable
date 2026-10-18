// Answers: the Explore section, the question sheet, the settings and what a viewer is left with. The server has no AI key
// here, so everything it would answer is faked through the routes, the way the Mentions spec does.
import AxeBuilder from '@axe-core/playwright'
import type { Page, Route } from '@playwright/test'
import { expect, test } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const NOW = Math.floor(Date.now() / 1000)
const WEEK = 7 * 86400
const cell = (seen: number, named: number, cited: number) => ({ seen, runs: 2, named, cited, position: named ? 2 : 0 })
const rounds = [2, 4, 6, 9].map((seen, i) => ({ round: NOW - (3 - i) * WEEK, seen, total: 30 }))

const report = {
  engines: ['openai', 'perplexity', 'anthropic'],
  latest: { ...rounds[3], complete: true },
  was: rounds[2],
  rivals: [{ name: 'Plausible', seen: 14, total: 30 }, { name: 'Umami', seen: 4, total: 30 }],
  questions: [
    { id: 4, text: 'best open-source analytics', active: true, engines: { openai: cell(2, 2, 2), perplexity: cell(1, 1, 0), anthropic: cell(0, 0, 0) }, state: 'both', instead: ['Plausible', 'Umami'], pages: ['/compare'] },
    { id: 5, text: 'analytics that shows revenue per page', active: true, engines: { openai: cell(0, 0, 0), perplexity: cell(2, 0, 2), anthropic: cell(0, 0, 0) }, state: 'cited', instead: ['Plausible'], pages: ['/pricing'] },
  ],
  pages: [{ path: '/compare', answers: 3, read: 410, sent: 31, revenue: 124000 }, { path: '/pricing', answers: 1, read: 20, sent: 2, revenue: 0 }],
  money: { currency: 'USD', exponent: 2 },
  rounds,
  changes: [{ at: NOW - 3600, engine: 'openai', question_id: 4, question: 'best open-source analytics', kind: 'seen' }],
  paused: false,
  next_at: NOW + 3 * 86400,
  country: 'DE',
}
const run = (n: number, named: boolean) => ({ run: n, ok: true, error: '', asked_at: NOW, text: 'Plausible and Umami are popular. Example is a self-hosted option.', citations: [{ url: 'https://plausible.io/', title: 'Plausible' }], sources: [], named, cited: false, position: named ? 2 : 0, sentence: named ? 'Example is a self-hosted option.' : '', rivals: [{ name: 'Plausible', named: true, cited: true, position: 1 }] })
const detail = { id: 4, text: 'best open-source analytics', active: true, rounds: [{ round: NOW, engines: { openai: [run(1, true), run(2, true)], perplexity: [run(1, true)], anthropic: [run(1, false)] } }] }
const setup = {
  engines: [{ id: 'openai', name: 'ChatGPT' }, { id: 'perplexity', name: 'Perplexity' }, { id: 'anthropic', name: 'Claude' }],
  questions: [{ id: 4, text: 'best open-source analytics', active: true }],
  competitors: [{ name: 'Plausible', domain: 'plausible.io' }],
  words: [HISTORY_DOMAIN, 'History'],
  max: 10,
  max_competitors: 5,
  country: 'DE',
  next_at: NOW + 86400,
  asked_at: 0,
  budget: { used: 3.4, cap: 20, paused: false },
}

const json = (r: Route, body: unknown) => r.fulfill({ json: body })

/** Answers is on at the server, and the person is who `role` says. */
async function seed(page: Page, who: string, role = 'owner') {
  await page.context().addCookies([{ name: 'trckable_session', value: await session(who), url: API }])
  await page.route('**/api/v1/me', async (r) => json(r, { ...(await (await r.fetch()).json()), answers: true, role }))
  await page.route('**/api/v1/sites/*/report/answers*', (r) => json(r, report))
  await page.route('**/api/v1/sites/*/answers/setup', (r) => json(r, setup))
  await page.route('**/api/v1/sites/*/answers/suggestions', (r) => json(r, { questions: ['simple alternative to Plausible for a small blog'], competitors: [] }))
  await page.route('**/api/v1/sites/*/answers/questions/4', (r) => json(r, detail))
}

for (const width of [375, 768, 1280]) {
  test(`the Answers section tells what the assistants said at ${width} px`, async ({ page }) => {
    test.slow()
    await seed(page, 'answers-section')
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${API}/${HISTORY_DOMAIN}?x=answers`)
    const section = page.locator('.an')
    await expect(section).toContainText('Seen in 9 of 30 answers', { timeout: 20_000 })
    await expect(section).toContainText('Last round 6 of 30')
    await expect(section).toContainText('What each API answered')
    await expect(section.getByRole('img', { name: 'ChatGPT: Named and linked' }).first()).toBeVisible()
    await expect(section.getByRole('img', { name: 'Claude: Not there' }).first()).toBeVisible()
    await expect(section).toContainText('Pages AI links to')
    await expect(section).toContainText('$1,240')
    // The first look at the section needs nothing sideways.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(wide).toBe(false)
  })
}

test('a question opens its answers as plain text, with the sentence that names the site marked', async ({ page }) => {
  test.slow()
  await seed(page, 'answers-sheet')
  await page.goto(`${API}/${HISTORY_DOMAIN}?x=answers`)
  await page.getByRole('button', { name: /best open-source analytics/ }).first().click()
  const sheet = page.getByRole('complementary', { name: 'best open-source analytics' })
  await expect(sheet.getByRole('heading', { name: 'best open-source analytics' })).toBeVisible({ timeout: 15_000 })
  await expect(sheet.locator('mark').first()).toHaveText('Example is a self-hosted option.')
  await expect(sheet).toContainText('Named instead')
  await expect(sheet).toContainText('Last 6 rounds')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})

test('the Answers section passes the accessibility check', async ({ page }) => {
  test.slow()
  await seed(page, 'answers-axe')
  await page.goto(`${API}/${HISTORY_DOMAIN}?x=answers`)
  await expect(page.locator('.an')).toContainText('Seen in 9 of 30 answers', { timeout: 20_000 })
  const res = await new AxeBuilder({ page }).include('.an').analyze()
  expect(res.violations.map((v) => v.id)).toEqual([])
})

test('an owner adds a question in Settings and saves it', async ({ page }) => {
  test.slow()
  await seed(page, 'answers-settings')
  let sent: unknown
  await page.route('**/api/v1/sites/*/answers/questions', async (r) => {
    sent = r.request().postDataJSON()
    await json(r, { questions: [{ id: 4, text: 'best open-source analytics', active: true }, { id: 9, text: 'privacy friendly analytics for a blog', active: true }] })
  })
  await page.goto(`${API}/${HISTORY_DOMAIN}?settings=answers`)
  const box = page.getByLabel('Add a question')
  await expect(box).toBeVisible({ timeout: 20_000 })
  await box.fill(HISTORY_DOMAIN + ' alternatives')
  await expect(page.getByText('This question names your site')).toBeVisible()
  await box.fill('privacy friendly analytics for a blog')
  await box.press('Enter')
  await page.getByRole('button', { name: 'Save questions' }).click()
  await expect(page.getByText('Questions saved')).toBeVisible()
  expect(sent).toEqual({ questions: [{ id: 4, text: 'best open-source analytics', active: true }, { text: 'privacy friendly analytics for a blog', active: true }] })
})

test('a viewer reads Answers but is offered nothing to change', async ({ page }) => {
  test.slow()
  await seed(page, 'answers-viewer', 'viewer')
  await page.route('**/api/v1/sites/*/report/answers*', (r) => json(r, { ...report, questions: [], latest: null, was: null, rounds: [], pages: [] }))
  await page.goto(`${API}/${HISTORY_DOMAIN}?x=answers`)
  await expect(page.getByText('Ask what your buyers ask')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Add questions' })).toHaveCount(0)
  // The Briefing's line is for reading too: it opens the section.
  await expect(page.locator('.an')).toHaveCount(0)
})
