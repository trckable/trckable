// Settings → Data & privacy: every switch and field changes what is recorded,
// not only what is saved. Visits are sent the way a tracker sends them and
// the question is always the same: is it counted or is it not. (The IP list
// and the avatar menu's own-browser flag have their own suite: exclude-visits.)
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { UA, getConfig, newSite, openSettings, paths, realPage, visit } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

test('Honour Do Not Track and Global Privacy Control: dropped before anything is stored when on, counted when off', async ({ page }) => {
  const site = await newSite(page, 'dnt')
  const signals = [
    ['/dnt', { DNT: '1' }],
    ['/gpc', { 'Sec-GPC': '1' }],
  ] as const
  // Off (the default): browsers that ask not to be tracked are counted like any.
  for (const [p, h] of signals) expect((await visit(page.request, site, p, { headers: h })).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/dnt', '/first', '/gpc'])

  await openSettings(page, site, 'privacy')
  const sw = page.getByRole('switch', { name: 'Honour Do Not Track and Global Privacy Control' })
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  expect((await getConfig(page.request, site)).honor_dnt).toBe(true)
  for (const [p, h] of signals) expect((await visit(page.request, site, p + '-on', { headers: h })).status()).toBe(202)
  expect((await visit(page.request, site, '/plain-on')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/dnt', '/first', '/gpc', '/plain-on'])

  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  expect((await visit(page.request, site, '/dnt-off-again', { headers: { DNT: '1' } })).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toContain('/dnt-off-again')
})

test('Excluded paths: "/admin/* skips everything under it", a plain path only itself, and nothing is stored', async ({ page }) => {
  const site = await newSite(page, 'paths')
  await openSettings(page, site, 'privacy')
  const field = page.locator('.srow', { hasText: 'Excluded paths' }).locator('textarea')
  await field.fill('/admin/*\n/preview')
  await field.blur()
  await expect(page.getByText('2 paths excluded')).toBeVisible()
  expect((await getConfig(page.request, site)).exclude_paths).toEqual(['/admin/*', '/preview'])
  for (const p of ['/admin/users', '/admin/a/b', '/preview', '/previews', '/admin', '/blog']) expect((await visit(page.request, site, p)).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/admin', '/blog', '/first', '/previews'])

  // A path that is not a path is said, and nothing changes.
  await field.fill('admin')
  await field.blur()
  // The server refuses it (the answer carries no text for the page to show), so nothing is saved.
  await expect(page.getByRole('alert').first()).toBeVisible()
  expect((await getConfig(page.request, site)).exclude_paths).toEqual(['/admin/*', '/preview'])

  // Take the rules away: everything counts again.
  await field.fill('')
  await field.blur()
  await expect(page.getByText('Nothing is excluded now')).toBeVisible()
  expect((await visit(page.request, site, '/preview-back')).status()).toBe(202)
  expect((await visit(page.request, site, '/admin/back')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/admin', '/admin/back', '/blog', '/first', '/preview-back', '/previews'])
})

test('Stricter bot filtering: on for a new site, saved when switched, and an honest robot is never a visit whichever way it is', async ({ page }) => {
  const site = await newSite(page, 'bots')
  await openSettings(page, site, 'privacy')
  const sw = page.getByRole('switch', { name: 'Stricter bot filtering' })
  // New sites start strict.
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  expect((await getConfig(page.request, site)).bot_strict).toBe(true)
  expect((await visit(page.request, site, '/strict-real')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/first', '/strict-real'])

  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  expect((await getConfig(page.request, site)).bot_strict).toBe(false)
  expect((await visit(page.request, site, '/loose')).status()).toBe(202)
  // An honest robot is never a visit, whichever way the switch is.
  expect((await visit(page.request, site, '/robot', { headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } })).status()).toBe(202)
  expect((await visit(page.request, site, '/after-robot')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/after-robot', '/first', '/loose', '/strict-real'])
})

test('Leave out my own visits: the tracker keeps the flag in the browser, Count it again undoes it', async ({ browser, page }) => {
  const site = await newSite(page, 'ownflag')
  await openSettings(page, site, 'privacy')
  const row = page.locator('.srow', { hasText: 'Leave out my own visits' })
  await expect(row.getByRole('link', { name: 'Leave this browser out' })).toHaveAttribute('href', `https://${site.domain}/?trckable=ignore`)
  await expect(row.getByRole('link', { name: 'Count it again' })).toHaveAttribute('href', `https://${site.domain}/?trckable=track`)

  const context = await browser.newContext({ userAgent: UA })
  const view = await realPage(context, site, '/a?trckable=ignore')
  await view.goto(`http://${site.domain}/b`)
  await view.goto(`http://${site.domain}/c`)
  await view.waitForTimeout(1500)
  expect(await paths(page.request, site)).toEqual(['/first'])
  await view.goto(`http://${site.domain}/d?trckable=track`)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/d', '/first'])
  await context.close()
})

test('Cookieless mode: the served script and the dashboard follow the switch, and a cookieless visit sets nothing', async ({ page, browser }) => {
  const site = await newSite(page, 'cookieless')
  await openSettings(page, site, 'privacy')
  const sw = page.getByRole('switch', { name: 'Cookieless mode' })
  const script = async () => (await (await page.request.get(`${API}/js/${site.id}.js`)).text()).includes('dataset.cookieless')
  expect(await script()).toBe(false)
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  expect((await getConfig(page.request, site)).consent_free).toBe(true)
  expect(await script()).toBe(true)
  // The rows it overrides say so and are locked on.
  const dnt = page.getByRole('switch', { name: 'Honour Do Not Track and Global Privacy Control' })
  await expect(dnt).toBeDisabled()
  await expect(dnt).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: 'Region and city' })).toBeDisabled()
  // Do Not Track is honoured whatever that switch was saved as.
  expect((await visit(page.request, site, '/cl-dnt', { headers: { DNT: '1' } })).status()).toBe(202)
  expect((await visit(page.request, site, '/cl-plain')).status()).toBe(202)
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toEqual(['/cl-plain', '/first'])

  // A real page with the cookieless script: nothing is stored in the browser.
  const context = await browser.newContext({ userAgent: UA })
  const view = await realPage(context, site, '/cookieless')
  await expect.poll(() => paths(page.request, site), { timeout: 15_000 }).toContain('/cookieless')
  expect((await context.cookies()).map((c) => c.name)).not.toContain('trckable_vid')
  expect(await view.evaluate(() => Object.keys(localStorage))).toEqual([])
  await context.close()
})
