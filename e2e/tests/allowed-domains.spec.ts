// Allowed domains (Settings → General): a refused hostname is offered with one
// tap, allowing it makes its visits count at once, removing it refuses them
// again, and the field can be opened straight from a link (the bell's notice).
// At 1440 and 390 wide, dark and light.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, UA, newSite, waitForEvents, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')
test.describe.configure({ mode: 'serial' })

const SHOTS = process.env.ALLOWED_SHOTS

const from = (page: Page, site: TestSite, host: string, id: string) =>
  page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site.id, k: 'pv', u: `https://${host}/p`, id, v: `k3j2.${id}` } })
const state = async (page: Page, site: TestSite) =>
  (await (await page.request.get(`${API}/api/v1/sites/${site.id}/allowed-domains`, { headers: H })).json()) as { allowed: string[]; refused: { host: string }[] }

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`allow a refused host, count it, remove it (${width})`, async ({ page }) => {
    test.setTimeout(180_000) // the server writes refused hostnames down once a minute
    await page.setViewportSize({ width, height })
    const site = await newSite(page, `alw${width}`)
    const host = `staging-${width}.example.net`

    // Refused first, and told where it came from once the server has counted it.
    expect((await from(page, site, host, 'r1' + width)).ok()).toBe(false)
    await expect.poll(async () => (await state(page, site)).refused.map((r) => r.host), { timeout: 90_000 }).toContain(host)

    // Opened by a link: the field is in view with the cursor in it.
    await page.goto(`${API}/?site=${site.id}&settings=site&focus=allowed-domains`)
    const dialog = page.getByRole('dialog', { name: `Settings for ${site.domain}` })
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    if (width < 700) await dialog.getByRole('tab', { name: 'General' }).click()
    const field = dialog.getByRole('textbox', { name: 'Allowed domains' })
    await expect(field).toBeVisible()
    await expect(dialog.getByText('Visits from these addresses count too')).toBeVisible()
    await expect(dialog.getByRole('button', { name: `Allow ${host}` })).toBeVisible()
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/allowed-${width}-${scheme}-offered.png` })
    }

    // One tap allows it; it is a chip now and no longer offered.
    await dialog.getByRole('button', { name: `Allow ${host}` }).click()
    await expect(dialog.getByRole('button', { name: `Remove ${host}` })).toBeVisible()
    await expect(dialog.getByRole('button', { name: `Allow ${host}` })).toHaveCount(0)
    expect((await state(page, site)).allowed).toEqual([host])
    expect((await from(page, site, host, 'a1' + width)).ok()).toBe(true)
    expect((await from(page, site, 'sub.' + host, 'a2' + width)).ok()).toBe(true)
    await waitForEvents(page.request, site, 3) // the site's first visit, and these two

    // A typed address is cleaned; a wrong one is told why and nothing is kept.
    await field.fill('https://www.Old-Site.example.org/shop')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Remove old-site.example.org' })).toBeVisible()
    await field.fill('not a host')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByRole('alert').or(dialog.locator('.field-err-msg'))).toContainText('hostnames')
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/allowed-${width}-${scheme}-listed.png` })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

    // Removing it refuses its visits again.
    await dialog.getByRole('button', { name: `Remove ${host}` }).click()
    await expect(dialog.getByRole('button', { name: `Remove ${host}` })).toHaveCount(0)
    expect((await from(page, site, host, 'a3' + width)).ok()).toBe(false)
  })
}
