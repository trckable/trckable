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
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message))
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
    test(`${metric}: switching periods in the page${park ? ' with the pointer on the chart' : ''}`, async ({ page }) => {
      const errors = watch(page)
      await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
      await page.goto(`${API}/${HISTORY_DOMAIN}?period=30d&metric=${metric}`)
      await expect(page.locator('.chart-wrap svg[role=img]').first()).toBeVisible({ timeout: 30_000 })
      await drawn(page, errors, `${metric} first load`)
      // A side card (a milestone reached, say) sits over the chart's corner: put it away, so the pointer is on the chart.
      for (const x of await page.locator('aside.side-card .side-card-x').all()) await x.click({ timeout: 2000 }).catch(() => {})
      for (const [label, key] of hops) {
        if (park) {
          // The pointer rests near the chart's right end: its card is open for a late bucket.
          const box = await page.locator('.chart-wrap').first().boundingBox()
          if (box) await page.mouse.move(box.x + box.width - 60, box.y + box.height / 2)
          if (box) await page.mouse.move(box.x + box.width - 50, box.y + box.height / 2)
          if (label === hops[0][0]) await expect(page.locator('.chart-wrap .cursor-pill').first(), `${metric}: a bucket is picked`).toBeVisible()
        }
        await hop(page, label, key)
        await drawn(page, errors, `${metric}: ${label}`)
      }
    })
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

test('a chart that cannot be drawn says so in its place, and the page stays', async ({ page }) => {
  // The chart's own picture refuses to be made: what a bad frame in it would do.
  await page.addInitScript(() => {
    const set = Element.prototype.setAttribute
    Element.prototype.setAttribute = function (name: string, value: string) {
      if (name === 'aria-label' && /: \d+ points,/.test(String(value))) throw new Error('the chart refuses')
      return set.call(this, name, value)
    }
  })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${HISTORY_DOMAIN}?period=30d&view=data`)
  await expect(page.getByText("Couldn't draw this.")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('group', { name: 'Key numbers' })).toBeVisible()
  await expect(page.locator('.tc').first()).toBeVisible()
})
