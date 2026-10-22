// Settings → Install, and Verify once visits arrive: the section is called what
// the site's state is, the snippet it shows is the one that works when pasted
// into a page, and "Receiving visits" flips with the first visit. The homepage
// check reads https://<domain>/ through a client that refuses this machine (a
// guard against probing the owner's own network), which a local test page is:
// its answer is given at the browser, as install.spec does, and the rest is real.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { UA, newSite, openSettings, paths, realPage, waitForEvents } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

test('Install shows the snippet that works, Copy gives it whole, and the first visit turns the section into Verify and the site into "Receiving visits"', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: API })
  const site = await newSite(page, 'verify', false)
  await openSettings(page, site, 'install')
  const dialog = page.getByRole('dialog', { name: `Settings for ${site.domain}` })
  await expect(dialog.getByRole('tab', { name: 'Install' })).toBeVisible()
  await expect(dialog.getByRole('tab', { name: 'Verify' })).toHaveCount(0)

  // The tag on screen is this site's: its id, its domain, and its own script.
  const tag = (await dialog.locator('pre').first().innerText()).trim()
  expect(tag).toContain(`data-site="${site.id}"`)
  expect(tag).toContain(`data-domain="${site.domain}"`)
  expect(tag).toContain(`src="${API}/js/${site.id}.js"`)
  await dialog.getByRole('button', { name: 'Copy' }).first().click()
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(tag)

  // General says the site has not been heard from yet.
  await dialog.getByRole('tab', { name: 'General' }).click()
  await expect(dialog.locator('.gen-state')).toHaveText('Not installed yet')

  // Pasted into a page, exactly as copied, it counts a visit.
  const visitor = await browser.newContext({ userAgent: UA })
  await realPage(visitor, site, '/pasted', `<!doctype html><html><head><title>pasted</title>${tag}</head><body>hello</body></html>`)
  await waitForEvents(page.request, site, 1)
  expect(await paths(page.request, site)).toEqual(['/pasted'])
  await visitor.close()

  // The section is now the check, and the site is receiving visits.
  await openSettings(page, site, 'install')
  await expect(dialog.getByRole('tab', { name: 'Verify' })).toBeVisible()
  await expect(dialog.getByRole('tab', { name: 'Install' })).toHaveCount(0)
  await dialog.getByRole('tab', { name: 'General' }).click()
  await expect(dialog.locator('.gen-state')).toHaveText('Receiving visits')
})

test('Verify: the homepage check, the snippet it found and the last visit, each said in its own line', async ({ page }) => {
  const site = await newSite(page, 'verifycheck')
  const answer = (body: object) =>
    page.route(`**/api/v1/sites/${site.id}/install/check`, (r) => r.fulfill({ json: { url: `https://${site.domain}/`, status: 200, scripts: 1, ...body } }))

  await answer({ found: 'site', via: 'page' })
  await openSettings(page, site, 'install')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Connected and verified' })).toBeVisible()
  const steps = dialog.locator('.install-steps')
  await expect(steps).toContainText(`${site.domain} answered (200)`)
  await expect(steps).toContainText("Found in the page, with this site's id")
  await expect(steps).toContainText('Visits arriving')
  await expect(steps).toContainText('on /first')

  // A page carrying another site's snippet is said on its step; visits are arriving, so the install still works.
  await page.unroute(`**/api/v1/sites/${site.id}/install/check`)
  await answer({ found: 'other' })
  await dialog.getByRole('button', { name: 'Verify again' }).click()
  await expect(steps).toContainText("with another site's id", { timeout: 10_000 })
  await expect(dialog.getByRole('heading', { name: 'Connected and verified' })).toBeVisible()
  // A homepage nobody could read is a note on its step: visits are arriving, so the headline stays calm, and the code stays one click away.
  await page.unroute(`**/api/v1/sites/${site.id}/install/check`)
  await page.route(`**/api/v1/sites/${site.id}/install/check`, (r) => r.fulfill({ json: { url: `https://${site.domain}/`, scripts: 0, error: 'the page answered 404' } }))
  await dialog.getByRole('button', { name: 'Verify again' }).click()
  await expect(steps).toContainText('the page answered 404', { timeout: 10_000 })
  await expect(dialog.getByRole('heading', { name: 'Connected and verified' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Snippet not seen' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Show the code again' })).toBeVisible()
})
