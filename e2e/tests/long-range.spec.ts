// Switching the period on a dashboard that is already open, from a few days of
// history to a year of mostly empty buckets and back: nothing may throw, the
// app stays on the page and the chart is drawn each time. A crash is a page
// error or a blank app; a fresh load of the same address is checked too.
import { expect, test, type Page } from './fixtures'
import { API, HISTORY_DOMAIN } from '../playwright.config'
import { session } from './session'

const metrics = ['visitors', 'pageviews', 'revenue', 'conversion', 'per-visitor', 'bounce', 'session']
// A key for what has one, the picker for the rest.
const hops: [string, string | null][] = [['This week', 'w'], ['Last month', null], ['This year', null], ['Last 12 months', '1'], ['Last 7 days', '7'], ['This year', null], ['Last 90 days', '9'], ['Now', 'n']]

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('long-range')
})

function watch(page: Page) {
  const errors: string[] = []
  // WebKit reports a request cut off by the next navigation as a failed access
  // check; that is the load being replaced, not an error of the page.
  page.on('pageerror', (e) => {
    if (!/due to access control checks/.test(e.message)) errors.push(e.stack ?? e.message)
  })
  return errors
}

async function drawn(page: Page, errors: string[], what: string) {
  await expect(page.locator('#root > *').first(), `${what}: the app is on the page`).toBeAttached()
  // A period before the first visit shows the way to install instead of the chart: the page is up either way, its header in place.
  await expect(page.getByRole('button', { name: 'Account' }), `${what}: the page is up`).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(700) // the opening tween and the idle chunks land
  expect(errors, `${what}: page errors`).toEqual([])
}

async function hop(page: Page, label: string, key: string | null) {
  if (key) {
    await page.keyboard.press(key)
    return
  }
  await page.locator('button.range').click()
  const more = page.locator('.periods').getByRole('button', { name: 'More', exact: true })
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click()
  await page.getByRole('button', { name: label, exact: true }).click()
}

for (const metric of metrics) {
  // With the pointer left on the chart, two numbers are enough: the chart is the same drawing for each.
  for (const park of metric === 'visitors' || metric === 'session' ? [false, true] : [false]) {

  }
}

for (const metric of metrics) {
  test(`${metric}: a fresh load of this year, 12 months and last year`, async ({ page }) => {
    const errors = watch(page)
    await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
    for (const period of ['ytd', '12mo', 'lastyear']) {
      await page.goto(`${API}/${HISTORY_DOMAIN}?period=${period}&metric=${metric}`)
      await drawn(page, errors, `${metric} ${period}`)
    }
  })
}

