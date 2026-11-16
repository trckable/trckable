// What each link shows: the sections its owner left on and, if they chose, one period. The server holds both (a
// hidden section's data is refused, not just left out of the page); the page offers only what is left.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, visit, openSettings } from './audit-kit'
import { session } from './session'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

test('the owner picks the sections and the period in the builder, and changes them in the row', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('share-scope-ui'), url: API }])
  const site = await newSite(page, 'sharescopeui')
  await openSettings(page, site, 'sharing')
  const card = page.locator('#shares')
  await card.getByRole('button', { name: 'New link' }).first().click()
  const sections = card.getByRole('group', { name: 'Sections' })
  for (const s of ['Pages', 'Sources', 'Places', 'Tech']) await expect(sections.getByRole('button', { name: s })).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByLabel('Period')).toHaveValue('')
  await sections.getByRole('button', { name: 'Sources' }).click()
  await sections.getByRole('button', { name: 'Tech' }).click()
  await card.getByLabel('Period').selectOption('7d')
  // The preview is the real page made from these options: the period is said, not offered.
  const preview = card.frameLocator('iframe.sl-live-page')
  await expect(preview.locator('.hd')).toBeVisible({ timeout: 20_000 })
  await expect(preview.locator('.share-period')).toHaveCount(0)
  await card.getByRole('button', { name: 'Create link' }).click()
  await card.getByRole('button', { name: 'Done' }).click()

  const listed = async () => (((await (await page.request.get(`${API}/api/v1/sites/${site.id}/shares`)).json()) as { shares: { sections: string[]; period: string }[] }).shares[0])
  expect(await listed()).toMatchObject({ sections: ['pages', 'places'], period: '7d' })
  const row = card.locator('.sl-row')
  await expect(row.getByRole('img', { name: 'Shows: Pages, Places' })).toBeVisible()
  await expect(row.getByRole('img', { name: /^Always / })).toBeVisible()

  // In the row: Sources back on, the period left to the reader.
  await row.getByRole('button', { name: /^Edit link/ }).click()
  const edit = card.locator('.sl-edit')
  await edit.getByRole('group', { name: 'Sections' }).getByRole('button', { name: 'Sources' }).click()
  await edit.getByLabel('Period').selectOption('')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(card.locator('.sl-edit')).toHaveCount(0)
  expect(await listed()).toMatchObject({ sections: ['pages', 'sources', 'places'], period: '' })
})

test('a stranger on a link with sections off is refused their data, and the page offers only what is left', async ({ page, browser }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('share-scope'), url: API }])
  const site = await newSite(page, 'sharescope')
  const ref = (host: string) => ({ referrer: `https://${host}/` })
  for (let i = 0; i < 4; i++) await visit(page.request, site, i % 2 ? '/pricing' : '/home', ref('news.example'))
  const make = async (data: object) => ((await (await page.request.post(`${API}/api/v1/sites/${site.id}/shares`, { headers: H, data })).json()) as { url: string }).url

  const url = await make({ name: 'Pages only', sections: ['pages'], period: '30d' })
  const reader = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const tab = await reader.newPage()
  await tab.goto(url)
  await expect(tab.locator('#xp.on')).toBeVisible({ timeout: 20_000 })

  // A link fixed to a period offers no switch of periods.
  await expect(tab.locator('.hd')).toBeVisible()
  await expect(tab.locator('.share-period')).toHaveCount(0)

  // Explore lists the sections that are on.
  await tab.keyboard.press('e')
  await tab.keyboard.press('f')
  await expect(tab.locator('#xp .xrail [data-xsec="pages"]')).toBeVisible()
  await expect(tab.locator('#xp .xrail [data-xsec="sources"], #xp .xrail [data-xsec="places"], #xp .xrail [data-xsec="tech"]')).toHaveCount(0)
  await tab.locator('#xp .xrail [data-xsec="pages"]').click()
  await expect(tab.locator('#xp .xt .xrw').first()).toBeVisible()

  // And the server says the same to anyone who asks around the page.
  const get = (q: string) => reader.request.get(`${API}/api/v1/share/report?${q}`)
  const rep = (await (await get('from=2020-01-01&to=2030-01-01&daily=1')).json()) as { from: string; current: { kpis: { visitors: number }; dims: Record<string, unknown[]> } }
  expect(rep.current.kpis.visitors).toBeGreaterThan(0) // the headline numbers are always there
  expect(rep.current.dims.page.length).toBeGreaterThan(0)
  for (const dim of ['channel', 'referrer', 'country', 'device', 'browser', 'os']) expect(rep.current.dims[dim], dim).toEqual([])
  expect(rep.from > '2020-01-01').toBe(true) // the period is the link's, not the one asked for
  expect((await get('f=country:US')).status()).toBe(403)
  expect((await get('f=referrer:news.example')).status()).toBe(403)
  expect((await get('f=page:/pricing')).status()).toBe(200)

  // A link with everything on, beside it, still reads all of it.
  const open = await make({ name: 'Everything' })
  const all = await reader.newPage()
  await all.goto(open)
  await expect(all.locator('#xp.on')).toBeVisible({ timeout: 20_000 })
  await expect(all.locator('.share-period')).toBeVisible() // a link that lets the reader choose still offers the periods
  const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
  expect(((await (await get(`from=${day(30)}&to=${day(0)}`)).json()) as { current: { dims: Record<string, unknown[]> } }).current.dims.channel.length).toBeGreaterThan(0)
  await reader.close()
})
