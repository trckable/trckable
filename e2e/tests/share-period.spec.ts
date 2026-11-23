// Share's period: the presets, All time, a custom range on the dashboard's calendar, and the comparison. Each choice is
// the picture the server draws (the request says so), and Download names the file after it.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the sheet')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test('Share: All time, a custom range and Compare reach the picture', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${API}/${STEADY_DOMAIN}?view=briefing&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
  await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await expect(dialog).toBeVisible()
  const picture = (params: string[]) => page.waitForResponse((r) => r.url().includes('/card?') && !r.url().includes('format=json') && params.every((p) => r.url().includes(p)) && r.url().includes('t=overview'))

  // The period is always open (#819). Compare is off until asked for.
  await expect(dialog.getByRole('switch', { name: 'Compare' })).toHaveAttribute('aria-checked', 'false')
  let res = picture(['period=30d', 'compare=1'])
  await dialog.getByRole('button', { name: '30 days' }).click()
  await dialog.getByRole('switch', { name: 'Compare' }).click()
  expect((await res).status()).toBe(200)

  // All time: the comparison is not offered, and the picture does not ask for it.
  res = picture(['period=all'])
  await dialog.getByRole('button', { name: 'All time' }).click()
  const all = await res
  expect(all.url()).not.toContain('compare=1')
  expect(all.headers()['content-type']).toBe('image/png')
  await expect(dialog.getByRole('switch', { name: 'Compare' })).toHaveCount(0)

  // A custom range: two days picked on the calendar.
  await dialog.getByRole('button', { name: 'Custom range' }).click()
  const days = dialog.locator('.cal .mk-day[data-day]:not([disabled])')
  res = picture(['period=custom', 'from=', 'to='])
  await days.nth(2).click()
  await days.nth(4).click()
  expect((await res).status()).toBe(200)
  const img = dialog.locator('.sd-preview img.sd-img:not(.is-out, .is-loader)')
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1200)

  const file = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /^Download \d+×\d+$/ }).click()
  expect((await file).suggestedFilename()).toMatch(/^trckable-.*-overview-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.png$/)
})

// The picture never says a number the dashboard contradicts: its big number is the report's visitors for the same window
// (the last 7 days ending today; all time from the first data).
test('Share: the card number is the dashboard number for 7 days and all time', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const sites = ((await (await page.request.get(`${API}/api/v1/sites`)).json()) as { sites: { id: string; domain: string; timezone: string }[] }).sites
  const site = sites.find((s) => s.domain === STEADY_DOMAIN)
  if (!site) throw new Error('no steady site')
  const day = (back: number) => {
    const d = new Date(Date.now() - back * 86_400_000)
    return new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone || 'UTC' }).format(d)
  }
  const visitors = async (from: string) => {
    const res = await page.request.get(`${API}/api/v1/sites/${site.id}/report?from=${from}&to=${day(0)}`)
    return ((await res.json()) as { kpis: { visitors: number } }).kpis.visitors
  }
  const big = async (period: string) => {
    const res = await page.request.get(`${API}/api/v1/sites/${site.id}/card?format=json&period=${period}&t=overview`)
    return ((await res.json()) as { big: string }).big
  }
  expect(await big('7d')).toBe((await visitors(day(6))).toLocaleString('en-US'))
  expect(await big('all')).toBe((await visitors('2000-01-01')).toLocaleString('en-US'))
})
