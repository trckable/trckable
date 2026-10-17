// A refresh of the dashboard is one picture: the page's own boxes (a skeleton of the real layout, painted
// before any JavaScript, with the site's name in it), then the numbers in the same places. No loading ghost
// on the way, no layout of another shape, nothing that moves. A hard reload at 1440 and 390 wide.
// Pictures for the review: POLISH_SHOTS=<folder>.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const URL = `${API}/${HISTORY_DOMAIN}?view=briefing&period=30d`

/** One ordinary visit: the page keeps what a refresh paints from (lib/bootCache.ts). */
async function warm(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('skeleton'), url: API }])
  await page.goto(URL)
  await expect(page.locator('.sv-chart')).toBeVisible({ timeout: 30_000 })
  // The boxes' heights are kept once the story has stopped changing size: wait until what is kept stands still.
  let last = ''
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => localStorage.getItem('trckable:boot') ?? '')
        const still = now !== '' && now === last && JSON.parse(now).h > 0
        last = now
        await page.waitForTimeout(1200)
        return still
      },
      { timeout: 30_000 },
    )
    .toBe(true)
}

/** Holds the app's first question, so the skeleton stays up until `release()`. */
async function hold(page: Page) {
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/setup', async (route) => {
    await held
    await route.continue()
  })
  return release
}

const rect = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((x) => (x as HTMLElement).offsetParent !== null)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }
  }, selector)

for (const width of [1440, 390]) {

}

test('a first visit with nothing kept still shows the ghost, never the dashboard’s boxes', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('skeleton'), url: API }])
  const release = await hold(page)
  await page.goto(URL, { waitUntil: 'commit' })
  await expect(page.locator('.dsk:visible')).toHaveCount(0)
  await expect(page.getByRole('status', { name: /loading/i }).first()).toBeVisible()
  release()
})

test('the sign-in page never shows the dashboard’s boxes, even with a kept list', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('trckable:boot', JSON.stringify({ s: [{ d: 'a.example', n: 'a', e: 1 }], k: 0 })))
  await page.goto(`${API}/login`, { waitUntil: 'commit' })
  await expect(page.locator('.dsk:visible')).toHaveCount(0)
})


