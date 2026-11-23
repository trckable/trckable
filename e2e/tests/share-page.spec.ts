// What a shared link and its embed open: the Briefing and Explore on the public report, read only. No Live, no site
// list, bell or person, no control that writes, and Explore offers only the tables the report fills.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, visit } from './audit-kit'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the page is the same')

test('a shared link is the Briefing and Explore, read only, and its embed is the same slim', async ({ page, browser }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('share-page'), url: API }])
  const site = await newSite(page, 'sharepage')
  for (let i = 0; i < 4; i++) await visit(page.request, site, i % 2 ? '/pricing' : '/home')
  const made = await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data: { name: 'Team' } })
  const url = ((await made.json()) as { url: string }).url

  const reader = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const tab = await reader.newPage()
  await tab.goto(url)
  await expect(tab.locator('#xp.on')).toBeVisible({ timeout: 20_000 })
  // Whose numbers they are, and none of the owner's header.
  await expect(tab.locator('.hd .share-who')).toContainText(site.domain)
  await expect(tab).toHaveTitle(`${site.domain} · analytics`)
  // What a chat app reads before any script runs: the title, the line and the card.
  const head = await (await reader.request.get(url)).text()
  expect(head).toContain(`<meta property="og:title" content="${site.domain} analytics">`)
  expect(head).toContain(`<meta name="twitter:card" content="summary_large_image">`)
  const card = await reader.request.get(`${url}/card.png`)
  expect(card.status()).toBe(200)
  expect(card.headers()['content-type']).toBe('image/png')
  for (const gone of ['#views', '.bellw', '.acctw', '[data-watch]', '.cact']) await expect(tab.locator(gone), gone).toHaveCount(0)
  // No Live tab, and no live count either unless the owner turned it on for the link.
  await expect(tab.getByRole('button', { name: /^Live/ })).toHaveCount(0)
  await expect(tab.locator('.share-live')).toHaveCount(0)
  expect((await tab.request.get(`${API}/api/v1/share/online`)).status()).toBe(404)
  // The period: three choices, no dates and no comparison, and the address cannot ask for another range.
  await expect(tab.locator('#share-period [role=tab]')).toHaveText(['7d', '30d', '12mo'])
  await expect(tab.locator('#share-period [aria-selected=true]')).toHaveText('30d')
  await expect(tab.locator('#xper .pwrap, .xperiod .pwrap')).toHaveCount(0)
  const odd = await (await tab.request.get(`${API}/api/v1/share/report?from=2020-01-01&to=2020-01-02&compare=year`)).json()
  expect(odd.previous).toBeUndefined()
  expect(Date.parse(odd.to) - Date.parse(odd.from)).toBeGreaterThanOrEqual(6 * 86_400_000)
  expect(odd.from > '2020-01-01').toBe(true)
  // Refresh reads the numbers again in place: a new report request, and the page stays where it is.
  const again = tab.waitForRequest((r) => r.url().includes('/share/report'))
  await tab.getByRole('button', { name: 'Refresh' }).click()
  await again
  expect(tab.url()).toBe(url)
  // Explore opens on what the report carries: tables, not the sections that need the rest of the API.
  await tab.keyboard.press('e')
  await expect(tab.locator('#xp.on')).toBeVisible()
  await tab.keyboard.press('f')
  await expect(tab.locator('#xp .xrail [data-xsec="overview"]')).toBeVisible()
  await expect(tab.locator('#xp .xrail [data-xsec="health"], #xp .xrail [data-xsec="web"]')).toHaveCount(0)
  await tab.locator('#xp .xrail [data-xsec="pages"]').click()
  await expect(tab.locator('#xp .xt .xrw').first()).toBeVisible()
  await expect(tab.locator('#xp')).not.toContainText('We could not load this')
  expect(await tab.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)

  // The embed: the same page, with the slim header (whose numbers, and by what).
  const framed = await reader.newPage()
  await framed.goto(`${url}?embed=1`)
  await expect(framed.locator('#xp.on')).toBeVisible({ timeout: 20_000 })
  await expect(framed.locator('.hd .embed-who')).toContainText(site.domain)
  await expect(framed.locator('#views, .bellw, .acctw')).toHaveCount(0)
  await reader.close()
})

test('a shared page by default carries no "Powered by" link', async ({ page, browser }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('share-page'), url: API }])
  const site = await newSite(page, 'sharepoweredby')
  const made = await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data: { name: 'Team' } })
  const url = ((await made.json()) as { url: string }).url
  const reader = await browser.newContext()
  const tab = await reader.newPage()
  await tab.goto(url)
  await expect(tab.locator('#xp.on')).toBeVisible({ timeout: 20_000 })
  await expect(tab.locator('.share-powered')).toHaveCount(0)
  await reader.close()
})

test('a link that allows it shows "Live · N now" in the header, and only the count', async ({ page, browser }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('share-page'), url: API }])
  const site = await newSite(page, 'sharelive')
  await visit(page.request, site, '/home')
  const made = await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data: { name: 'Team', live: true } })
  const url = ((await made.json()) as { url: string }).url
  const reader = await browser.newContext()
  const tab = await reader.newPage()
  await tab.goto(url)
  await expect(tab.locator('#xp.on')).toBeVisible({ timeout: 20_000 })
  await expect(tab.locator('.hd .share-live')).toContainText(/Live · \d+ now/)
  await expect(tab.locator('#views')).toHaveCount(0)
  await reader.close()
})
