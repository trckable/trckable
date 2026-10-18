// A site before its first visit, on the Briefing's own page: it says it is ready and listening, has the one line to paste
// (with this site's id) and the check, every other way in under it, and turns into the Briefing by itself when a visit lands.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { newSite, visit } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the page is the same')

test('before the first visit: ready and listening, the line to paste, the check, other ways, and the Briefing once a visit lands', async ({ page }) => {
  test.slow()
  const site = await newSite(page, 'fresh', false)
  // An empty v is the address with no view: the suite would otherwise send it to Explore.
  await page.goto(`${API}/${site.domain}?v=`)
  const hero = page.locator('.hero')
  await expect(hero.locator('.mk-hl').first()).toContainText(`${site.domain} is ready.`, { timeout: 20_000 })
  await expect(hero.locator('.mk-hl').first()).toContainText('Waiting for the first visit.')
  await expect(hero).toContainText('Listening for the first visitor')
  // The line to paste carries this site's id, and can be copied.
  await expect(hero.locator('code.snip')).toContainText(`data-site="${site.id}"`)
  await expect(hero.getByRole('button', { name: 'Copy the line' })).toBeVisible()
  // The check says what it found (the suite's server cannot reach the site: it says so, and never "found").
  await hero.getByRole('button', { name: 'I pasted it, check now' }).click()
  await expect(page.locator('.fresh-found')).not.toHaveText('', { timeout: 20_000 })
  // Every other way in is under it: a platform, with its own steps.
  await page.locator('.fresh-other summary').click()
  await page.locator('.fresh-pick select').selectOption('react')
  await expect(page.locator('.fresh-other')).toContainText('npm i trckable')
  await expect(page.locator('.fresh-other').getByRole('button', { name: 'Copy a prompt for your AI editor' })).toBeVisible()
  // A real pageview turns the page into the Briefing, with no reload.
  await visit(page.request, site, '/first')
  await expect(page.locator('.hero .kcs, .kcs').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('code.snip')).toHaveCount(0)
})

for (const size of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`before the first visit, on a ${size.width}x${size.height} phone, the page fits the screen and does not scroll`, async ({ page }) => {
    test.slow()
    await page.setViewportSize(size)
    const site = await newSite(page, 'freshfit', false)
    await page.goto(`${API}/${site.domain}?v=`)
    await expect(page.locator('.hero .mk-hl').first()).toContainText(`${site.domain} is ready.`, { timeout: 20_000 })
    const [scroll, inner] = await page.evaluate(() => [document.scrollingElement!.scrollHeight, window.innerHeight])
    expect(scroll).toBeLessThanOrEqual(inner)
  })
}
