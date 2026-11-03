// Explore tells the truth: every table and card is held to a site whose figures were counted by hand (truth-fixture.ts).
// What is shown equals the rows behind it, a share is a share of the people of the period, a bar is as long as its
// number says, the lines against the period before are the right multiples, and a table nothing was recorded for says
// so instead of listing zeros. Chromium only.
import { expect, test, type Locator, type Page } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, TOKEN, TRUTH_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the numbers')

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'explore truth e2e password 1'

// One session for every test of the file, made by whichever worker gets there first (signing in is rate limited).
async function session(): Promise<string> {
  const file = join(process.env.TRCKABLE_DATA_DIR!, 'truth-session')
  try {
    openSync(file + '.lock', 'wx')
  } catch {
    for (let i = 0; i < 300 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100))
    return readFileSync(file, 'utf8')
  }
  const email = `truth-${Date.now()}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'owner'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 4) throw e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  const value = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
  if (!res.ok || !value) throw new Error(`sign in: ${res.status}`)
  writeFileSync(file, value)
  return value
}

let cookie = ''
test.beforeAll(async () => {
  cookie = await session()
})

/** The table card open now (a table is a card of its section's page, filled in when it is scrolled to). */
let cur = ''
/** The places tables are one card, with a switch: the address names the one it opens on. */
const PLACES = ['countries', 'regions', 'cities', 'timezones', 'languages']
const card = (page: Page) => page.locator(`#xp [data-xcard="${PLACES.includes(cur) ? 'places' : cur}"]`)

/** Opens one table of Explore over the fixture's last seven days (the period before it is the 23 people of the fixture). */
async function open(page: Page, tab: string) {
  cur = tab
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${TRUTH_DOMAIN}?view=briefing&period=7d&x=${tab}`)
  await expect(page.locator('#xp.on')).toBeVisible()
  // (A card with nothing in it is hidden by its style: it is there, not shown.)
  await expect(card(page)).toBeAttached()
  await card(page).evaluate((el) => el.scrollIntoView())
  await expect(card(page).locator('.xloading, .mk-loading')).toHaveCount(0)
}

interface Line {
  name: string
  n: number
  vs: string
  share: string
  width: number
}

/** The rows of the open table of people, as drawn: the name, the count, the line against the period before, the share and the bar's length. */
async function lines(page: Page): Promise<Line[]> {
  const rows = card(page).locator('.xt .xrw')
  await expect(rows.first()).toBeVisible()
  // A card lists its first five rows; the rest is one press away.
  const all = card(page).getByRole('button', { name: /^Show all/ })
  if (await all.count()) await all.click()
  return rows.evaluateAll((els) =>
    els.map((el) => ({
      name: el.querySelector('.mk-bar > span')!.textContent!.replace(/^\p{Regional_Indicator}{2}\s*/u, '').trim(),
      n: Number(el.querySelector('.mk-n')!.textContent!.replace(/[^\d]/g, '')),
      vs: el.querySelector('.d')!.textContent!.trim(),
      share: el.querySelector('.sh')!.textContent!.trim(),
      width: parseFloat((el.querySelector('.mk-bar i') as HTMLElement).style.width),
    })),
  )
}

/** Counts drawn as animated digits (a number-flow element): each digit wheel stands at its --current. */
const numbers = (els: Locator) =>
  els.evaluateAll((bs) => bs.map((b) => [...(b.firstElementChild?.shadowRoot?.querySelectorAll('[part~="integer-digit"]') ?? [])].map((d) => (d as HTMLElement).style.getPropertyValue('--current').trim()).join('')))

const names = (l: Line[]) => l.map((x) => x.name)
const counts = (l: Line[]) => Object.fromEntries(l.map((x) => [x.name, x.n]))

/** A table that equals the hand count: the rows, in that order, and the bars as long as their numbers say. */
async function expectTable(page: Page, want: [string, number][], people = 37) {
  const got = await lines(page)
  expect(got.map((x) => [x.name, x.n])).toEqual(want)
  const top = want[0][1]
  for (const [i, x] of got.entries()) {
    expect(x.width, `the bar of ${x.name} is its number over the top one`).toBeCloseTo((want[i][1] / top) * 100, 0)
    // The share is of the people of the period, never of the rows on show.
    const p = (want[i][1] / people) * 100
    expect(x.share, `the share of ${x.name}`).toBe(p < 0.5 ? '<1%' : `${Math.round(p)}%`)
  }
}

const tableOf: [string, [string, number][]][] = [
  ['pages', [['Home page', 24], ['/pricing', 21], ['/blog', 4]]],
  ['exits', [['/pricing', 21], ['Home page', 12], ['/blog', 4]]],
  ['sources', [['Search', 18], ['Direct', 7], ['Social', 5], ['AI assistants', 4], ['Email', 3]]],
  ['referrers', [['google.com', 18], ['news.ycombinator.com', 5], ['chatgpt.com', 4]]],
  ['utm', [['launch', 3]]],
  ['countries', [['Germany', 21], ['United States', 9], ['United Kingdom', 7]]],
  ['regions', [['Berlin', 12], ['England', 7], ['Bavaria', 6], ['California', 5], ['Texas', 4], ['Hesse', 3]]],
  ['cities', [['Berlin', 12], ['London', 7], ['Munich', 6], ['San Francisco', 5], ['Austin', 4], ['Frankfurt', 3]]],
  ['devices', [['Desktop', 22], ['Mobile', 8], ['Tablet', 7]]],
  ['browsers', [['Chrome', 26], ['Firefox', 6], ['Safari', 5]]],
  ['bversion', [['Unknown', 37]]],
]

for (const [tab, want] of tableOf) {
  test(`${tab} is the hand count`, async ({ page }) => {
    await open(page, tab)
    await expectTable(page, want)
  })
}

test('the overview cards and its two lists equal the hand count', async ({ page }) => {
  await open(page, 'overview')
  const cards = card(page).locator('.sumrow .sum')
  await expect(cards).toHaveCount(4)
  // 37 people against 23 before is 61% more; 49 views; no money and no checks: nothing is made up for them.
  const people = cards.nth(0)
  await expect(people.locator('.sum-v')).toHaveText('37')
  await expect(people.locator('.sum-d')).toHaveText(/\+61%/)
  const second = cards.nth(1)
  await expect(second.locator('.sum-l')).toHaveText('Signup')
  await expect(second.locator('.sum-v')).toHaveText('4')
  const third = cards.nth(2)
  await expect(third).toHaveAttribute('data-sum', 'uptime')
  await expect(third.locator('.sum-v')).toHaveText('–')
  await expect(third.locator('.sum-d')).toHaveText('checks are off')
  // Bounced: 25 of 37 visits saw one page and signed nothing up (68%).
  await expect(cards.nth(3).locator('.sum-v')).toHaveText('68%')
  const lists = card(page).locator('.x2 > div')
  const pages = lists.nth(0).locator('.xrw')
  await expect(pages).toHaveCount(3)
  await expect(pages.nth(0).locator('.mk-n')).toHaveText('24')
  await expect(pages.nth(0).locator('.sh')).toHaveText('65%')
  await expect(pages.nth(2).locator('.mk-n')).toHaveText('4')
  const sources = lists.nth(1).locator('.xrw')
  await expect(sources.nth(0).locator('.mk-bar > span')).toHaveText('Search')
  await expect(sources.nth(0).locator('.mk-n')).toHaveText('18')
  await expect(sources.nth(0).locator('.sh')).toHaveText('49%')
})

test('the lines against the period before are the changes of the hand count', async ({ page }) => {
  await open(page, 'referrers')
  const got = Object.fromEntries((await lines(page)).map((x) => [x.name, x.vs]))
  // google.com: 18 now, 10 before (80% more); Hacker News: 5 and 5; chatgpt.com: nobody before.
  expect(got['google.com']).toBe('▲ 80%')
  expect(got['news.ycombinator.com']).toBe('≈ same')
  expect(got['chatgpt.com']).toBe('–')
  await open(page, 'sources')
  const channels = Object.fromEntries((await lines(page)).map((x) => [x.name, x.vs]))
  // Direct: 7 now, 8 before: inside what is usual.
  expect(channels['Direct']).toBe('≈ same')
  expect(channels['Search']).toBe('▲ 80%')
})

test('a tab nothing was recorded for says so, with no row of zeros', async ({ page }) => {
  for (const tab of ['languages', 'screens', 'groups', 'bots', 'outbound']) {
    await open(page, tab)
    await expect(card(page).locator('.xt .xrw'), `${tab} lists nothing`).toHaveCount(0)
    await expect(card(page).locator('.xempty, .xe'), `${tab} says there is nothing`).toBeVisible()
  }
})

test('speed that no visit measured says so and lists no pages', async ({ page }) => {
  await open(page, 'speed')
  await expect(card(page).locator('.xempty')).toContainText('No page measured yet')
  await expect(card(page).locator('.xt .xrw')).toHaveCount(0)
  await expect(card(page).locator('.sumrow .sum')).toHaveCount(0)
})

test('what needs payments shows no figures that are not there', async ({ page }) => {
  for (const tab of ['sales', 'revmap', 'earners', 'sells', 'payments', 'vsale', 'toconvert']) {
    await open(page, tab)
    const lock = card(page).locator('.lkc')
    await expect(lock, `${tab} asks for the payments`).toBeVisible()
    // No example amounts stand where this site's own will be.
    await expect(lock.locator('.lkc-s, .lkc-tag')).toHaveCount(0)
    await expect(lock).not.toContainText(/\$\s?\d/)
  }
  await open(page, 'search')
  await expect(card(page).locator('.lkc')).toBeVisible()
  await expect(card(page).locator('.lkc .lkc-s')).toHaveCount(0)
})

test('goals and the funnel count the people who got there', async ({ page }) => {
  await open(page, 'funnels')
  // Seen the home page: 24. Then the pricing page after it: 12. Then signed up: 4.
  await expect(card(page).locator('.mf')).toBeVisible()
  const steps = card(page).locator('.mf .fs-heads li:not(.ghost) b')
  await expect(steps).toHaveCount(3)
  await expect.poll(() => numbers(steps)).toEqual(['24', '12', '4'])
  await expect.poll(() => numbers(card(page).locator('.grs .gr .gr-ring b'))).toEqual(['4'])
})

test('the screens and the other cards of a site with no payments or robots show no error and no placeholder', async ({ page }) => {
  for (const tab of ['highlights', 'overtime', 'hours', 'flow', 'retention', 'people', 'mentions']) {
    await open(page, tab)
    await expect(card(page), `${tab} did not fail`).not.toContainText(/couldn.t|failed|error/i)
    await expect(card(page), `${tab} has no sample`).not.toContainText(/sample/i)
  }
})

test('the report lists as many rows as it is asked for, up to a hundred', async ({ request }) => {
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
  const auth = { Authorization: 'Bearer ' + TOKEN }
  const sites = ((await (await request.get(`${API}/api/v1/sites`, { headers: auth })).json()) as { sites: { id: string; domain: string }[] }).sites
  const site = sites.find((x) => x.domain === TRUTH_DOMAIN)!.id
  const rows = async (limit: string) => {
    const r = await request.get(`${API}/api/v1/sites/${site}/report?from=${day(6)}&to=${day(0)}${limit}&deep=1`, { headers: auth })
    expect(r.ok()).toBe(true)
    const j = (await r.json()) as { current: { kpis: { visitors: number }; dims: Record<string, { value: string; visitors: number }[]> } }
    return j.current
  }
  const one = await rows('&limit=2')
  expect(one.dims.city.map((x) => [x.value, x.visitors])).toEqual([['Berlin', 12], ['London', 7]])
  const all = await rows('&limit=100')
  expect(all.dims.city).toHaveLength(6)
  expect(all.kpis.visitors).toBe(37)
  // No row has more people than the period had, and the rows of a breakdown every visit has one of add up to them.
  for (const dim of ['country', 'device', 'browser', 'channel']) expect(all.dims[dim].reduce((p, x) => p + x.visitors, 0), dim).toBe(37)
})
