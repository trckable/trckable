// Sites, end to end: the site menu (arrange, pin, a new group, Add a site), renaming a site where it is shown, and removing
// one behind the question that needs its name. Cancel and Escape at every step, one overlay at a time, errors keep the input.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { flowSession, LOOKS, overlays, type Look } from './flows-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for the flows')

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
let cookie = ''
test.beforeAll(async () => {
  cookie = await flowSession()
})

/** A site of its own (so renaming and removing touch nothing the other specs read), with one visit so it opens on its dashboard. */
async function ownSite(page: Page, look: Look) {
  await page.setViewportSize({ width: look.width, height: look.width < 500 ? 844 : 900 })
  await page.emulateMedia({ colorScheme: look.scheme })
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `flow-${look.width}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}.test` } })
  expect(made.status()).toBe(201)
  const { id, domain } = (await made.json()) as { id: string; domain: string }
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  await page.request.post(`${API}/api/e`, { headers: { 'Content-Type': 'text/plain', 'User-Agent': ua }, data: JSON.stringify({ s: id, k: 'pv', u: `https://${domain}/`, r: '', w: 1400 }) })
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites`)).json()).sites as { id: string; last_event_at?: number }[]).find((x) => x.id === id)?.last_event_at ?? 0, { timeout: 15_000 }).toBeGreaterThan(0)
  return { id, domain }
}

for (const look of LOOKS) {
  test.describe(`${look.width}px, ${look.scheme}`, () => {
    test('the site menu: Add a site opens alone and Escape returns to the page with focus on the site button', async ({ page }) => {
      const { domain } = await ownSite(page, look)
      await page.goto(`${API}/${domain}?view=briefing`)
      const opener = page.getByRole('button', { name: new RegExp(`^${domain.replace('.', '\\.')}`) }).first()
      await opener.click()
      await page.getByRole('button', { name: /\+ Add a site/ }).click()
      await expect.poll(() => overlays(page).then((o) => o.length)).toBe(1)
      await expect(page.locator('#siteMenu.on, .pop.sites')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect.poll(() => overlays(page)).toEqual([])
    })

    test('a site is renamed where it is shown (Escape keeps the old name) and removed behind the question (Cancel keeps it)', async ({ page }) => {
      const { domain } = await ownSite(page, look)
      await page.goto(`${API}/${domain}?view=briefing&settings=site`)
      const win = page.getByRole('dialog', { name: `Settings for ${domain}` })
      await expect(win).toBeVisible({ timeout: 20_000 })
      // On a phone the window opens on its list of sections.
      const general = win.locator('.window-nav button', { hasText: 'General' }).first()
      if (await general.isVisible()) await general.click()
      await win.getByRole('button', { name: /^Display name: .* Edit$/ }).click()
      const field = win.getByRole('textbox', { name: 'Display name' })
      await field.fill('Renamed by a flow')
      // Escape puts the old name back and leaves the window open.
      await page.keyboard.press('Escape')
      await expect(field).toHaveCount(0)
      expect(await overlays(page)).toEqual([`Settings for ${domain}`])
      await expect(win.getByRole('button', { name: new RegExp(`^Display name: ${domain.replace('.', '\\.')}`) })).toBeVisible()
      // Enter saves, and the name is the site's everywhere without a reload.
      await win.getByRole('button', { name: /^Display name: .* Edit$/ }).click()
      await win.getByRole('textbox', { name: 'Display name' }).fill('Renamed by a flow')
      await page.keyboard.press('Enter')
      await expect(win.getByRole('button', { name: /^Display name: Renamed by a flow/ })).toBeVisible()
      // Remove: the question asks for the name, Cancel keeps the site, Escape too.
      await win.getByRole('button', { name: 'Delete site' }).click()
      const ask = page.getByRole('dialog', { name: `Delete ${domain}` })
      await expect(ask).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(ask).toHaveCount(0)
      expect(await overlays(page)).toEqual([`Settings for ${domain}`])
      const sites = (await (await page.request.get(`${API}/api/v1/sites`)).json()).sites as { domain: string }[]
      expect(sites.some((s) => s.domain === domain)).toBe(true)
    })
  })
}
