// Share, step 4: an Explore section's Share icon opens the sheet on that section's pictures; the sheet gives the
// picture or its text post; Copy link puts the site's public link on the clipboard.
import { expect, test } from './fixtures'
import { flowSession } from './flows-kit'
import { API, STEADY_DOMAIN } from '../playwright.config'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough')

let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

async function openExplore(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  await page.goto(`${API}/${STEADY_DOMAIN}?view=explore&period=7d`)
  await expect(page.locator('#xp')).toBeVisible({ timeout: 20_000 })
}

test('Share: on a desktop it is the header button alone, with no second one in the section row', async ({ page }) => {
  await openExplore(page, 1280)
  await page.locator('nav, aside').getByText('Sources', { exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(1)
  await expect(page.locator('#xp .xtb').getByRole('button', { name: 'Share' })).toHaveCount(0)
  await page.locator('.share-chip').click()
  await expect(page.getByRole('dialog', { name: 'Share your numbers' })).toBeVisible()
})

test('Share: on a phone it is the first item of the menu', async ({ page }) => {
  await openExplore(page, 390)
  await page.locator('.xmore').click()
  const first = page.locator('#xm-more [role=menuitem]').first()
  await expect(first).toHaveText(/Share a picture/)
  await first.click()
  await expect(page.getByRole('dialog', { name: 'Share your numbers' })).toBeVisible()
})

test('Share: a text post says the picture, and Copy link puts the public link on the clipboard', async ({ page }) => {
  const sites = await (await page.request.get(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })).json()
  const id = sites.sites.find((s: { domain: string }) => s.domain === STEADY_DOMAIN).id
  const made = await (await page.request.post(`${API}/api/v1/sites/${id}/shares`, { headers: { Cookie: `trckable_session=${cookie}`, 'X-Trckable-Request': '1' }, data: { name: 'Step 4' } })).json()
  await openExplore(page, 1280)
  await page.locator('nav, aside').getByText('Sources', { exact: true }).first().click()
  await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await dialog.getByRole('radio', { name: /^Top sources/ }).click()
  await dialog.getByRole('radio', { name: 'Text post' }).click()
  await expect(dialog.locator('.sd-post')).toContainText(STEADY_DOMAIN)
  await expect(dialog.locator('.sd-post')).toContainText('Top sources')
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Top sources')
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  // Other suites may have made links of this site: then the dialog asks which, and this is the one.
  const pick = dialog.getByRole('menuitem', { name: 'Step 4' })
  if (await pick.isVisible({ timeout: 1500 }).catch(() => false)) await pick.click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(made.url)
  // And says which link it copied.
  await expect(page.getByText('Copied “Step 4”').last()).toBeVisible()
})

test('Share: Copy link asks which when there are several, and the toast names the one copied', async ({ page }) => {
  const sites = await (await page.request.get(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })).json()
  const id = sites.sites.find((s: { domain: string }) => s.domain === STEADY_DOMAIN).id
  const headers = { Cookie: `trckable_session=${cookie}`, 'X-Trckable-Request': '1' }
  const one = await (await page.request.post(`${API}/api/v1/sites/${id}/shares`, { headers, data: { name: 'Pick one' } })).json()
  const two = await (await page.request.post(`${API}/api/v1/sites/${id}/shares`, { headers, data: { name: 'Pick two', password: 'a long enough phrase' } })).json()
  await openExplore(page, 1280)
  await page.locator('nav, aside').getByText('Sources', { exact: true }).first().click()
  await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  // The icon in the header says what it is.
  await expect(dialog.getByRole('button', { name: 'Links', exact: true })).toContainText('Links')
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  const picker = dialog.getByRole('menu', { name: 'Which link do you want to copy?' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('img', { name: 'Has a password' })).toHaveCount(1)
  await picker.getByRole('menuitem', { name: /Pick two/ }).click()
  await expect(picker).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(two.url)
  await expect(page.getByText('Copied “Pick two”').last()).toBeVisible()
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await picker.getByRole('menuitem', { name: /Pick one/ }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(one.url)
  await expect(page.getByText('Copied “Pick one”').last()).toBeVisible()
})

test('Share: a text post goes to X and LinkedIn with its words and a public link, and is copied for Slack', async ({ page, context }) => {
  const sites = await (await page.request.get(`${API}/api/v1/sites`, { headers: { Cookie: `trckable_session=${cookie}` } })).json()
  const id = sites.sites.find((s: { domain: string }) => s.domain === STEADY_DOMAIN).id
  const headers = { Cookie: `trckable_session=${cookie}`, 'X-Trckable-Request': '1' }
  await page.request.post(`${API}/api/v1/sites/${id}/shares`, { headers, data: { name: 'Post link' } })
  await context.route(/^https:\/\/(x\.com|www\.linkedin\.com)\//, (route) => route.fulfill({ contentType: 'text/html', body: '<title>network</title>' }))
  await openExplore(page, 1280)
  await page.locator('nav, aside').getByText('Sources', { exact: true }).first().click()
  await page.locator('.share-chip').click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await dialog.getByRole('radio', { name: /^Top sources/ }).click()
  await dialog.getByRole('radio', { name: 'Text post' }).click()
  await expect(dialog.locator('.sd-post')).toContainText('Top sources')
  const post = (await dialog.locator('.sd-post').innerText()).trim()

  const [x] = await Promise.all([context.waitForEvent('page'), dialog.getByRole('button', { name: 'Post on X' }).click()])
  await x.waitForURL(/x\.com\/intent\/post/)
  const xs = new URL(x.url()).searchParams
  expect(xs.get('text')).toContain('Top sources')
  expect(post).toContain((xs.get('text') ?? '').split('\n')[0])
  expect(xs.get('url')).toMatch(/\/s\/[a-z0-9]{20,}$/) // a public link of the site, the newest
  await x.close()
  const [li] = await Promise.all([context.waitForEvent('page'), dialog.getByRole('button', { name: 'Post on LinkedIn' }).click()])
  await li.waitForURL(/linkedin\.com\/feed/)
  expect(new URL(li.url()).searchParams.get('text')).toMatch(/\/s\/[a-z0-9]{20,}$/)
  await li.close()

  await dialog.getByRole('button', { name: 'Copy for Slack' }).click()
  await expect(page.getByText('Copied for Slack').last()).toBeVisible()
  const slack = await page.evaluate(() => navigator.clipboard.readText())
  expect(slack).toContain('Top sources')
  expect(slack).toMatch(/\/s\/[a-z0-9]{20,}\s*$/)
})
