// Changing a site's domain (Settings → General → Domain): the same site, its
// history and snippet; the old address still counts for a while and "Stop now"
// ends that; a viewer only reads. At 1440 and 390 wide.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from './fixtures'
import { API, TOKEN } from '../playwright.config'
import { H, UA, newSite, openSettings, waitForEvents, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

// One after the other: three signed-in sites sending visits at once made the visit count wait longer than its limit on a busy machine.
test.describe.configure({ mode: 'serial' })

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const AUTH = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }
const SHOTS = process.env.DOMAIN_SHOTS

const state = async (page: Page, site: TestSite) =>
  (await (await page.request.get(`${API}/api/v1/sites/${site.id}/domain`, { headers: H })).json()) as { domain: string; former: { host: string }[] }
const from = (page: Page, site: TestSite, host: string, id: string) =>
  page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site.id, k: 'pv', u: `https://${host}/after`, id, v: `k3j2.${id}` } })

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`change a site's domain, keep counting the old one, then stop it (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const site = await newSite(page, `dom${width}`)
    const next = `moved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example.org`
    await openSettings(page, site, 'site')
    const dialog = page.getByRole('dialog', { name: `Settings for ${site.domain}` })
    await dialog.getByRole('tab', { name: 'General' }).click() // on a phone the sections list comes first
    await expect(dialog.getByText('Domain', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Change', exact: true }).click()

    const ask = page.getByRole('dialog', { name: 'Change domain' })
    await ask.getByRole('textbox', { name: 'New domain' }).fill(site.domain)
    await ask.getByRole('button', { name: 'Continue' }).click()
    await expect(ask.getByText("already this site's address")).toBeVisible()

    await ask.getByRole('textbox', { name: 'New domain' }).fill(`https://www.${next.toUpperCase()}/`)
    await ask.getByRole('button', { name: 'Continue' }).click()
    await expect(ask.getByRole('heading', { name: `Change ${site.domain} to ${next}?` })).toBeVisible()
    await expect(ask.getByText('Nothing is counted twice')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/domain-confirm-${width}.png` })
    expect((await state(page, site)).domain).toBe(site.domain) // nothing changed before the confirm
    await ask.getByRole('button', { name: 'Change domain' }).click()

    // The dialog is named after the domain, so it is the new name now.
    const moved = page.getByRole('dialog', { name: `Settings for ${next}` })
    await expect(moved.getByText(`Also accepting ${site.domain} until`)).toBeVisible()
    await expect(moved.locator('.dom-name')).toHaveText(next)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/domain-after-${width}.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

    // The same site, one visit so far; the old address and the new one both count, a stranger does not.
    expect((await state(page, site)).former.map((f) => f.host)).toEqual([site.domain])
    expect((await from(page, site, site.domain, 'old1' + width)).ok()).toBe(true)
    expect((await from(page, site, next, 'new1' + width)).ok()).toBe(true)
    expect((await from(page, site, 'stranger.example.net', 'str1' + width)).ok()).toBe(false)
    await waitForEvents(page.request, site, 3)
    const notes = (await (await page.request.get(`${API}/api/v1/sites/${site.id}/annotations?from=2000-01-01&to=2100-01-01`, { headers: H })).json()) as { annotations: { text: string }[] }
    expect(notes.annotations.map((n) => n.text)).toContain(`Domain changed to ${next}`)

    await moved.getByRole('button', { name: 'Stop now' }).click()
    await expect(moved.getByText('Also accepting')).toHaveCount(0)
    expect((await from(page, site, site.domain, 'old2' + width)).ok()).toBe(false)
    expect((await from(page, site, next, 'new2' + width)).ok()).toBe(true)
    await waitForEvents(page.request, site, 4)
  })
}

test('a viewer is offered no change and the server refuses it', async ({ page, request }) => {
  // A viewer sees the sites they were given: the seeded one.
  const sites = ((await (await request.get(`${API}/api/v1/sites`, { headers: AUTH })).json()) as { sites: { id: string; domain: string }[] }).sites
  const site = sites.find((s) => s.domain === 'example.com')!
  const email = `domview-${Date.now()}@example.com`
  const password = 'viewer e2e password 1'
  execFileSync(BIN, ['admin', 'add-user', email, '--role', 'viewer'], { input: password + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const cookie = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  expect(cookie).toBeTruthy()
  await page.context().clearCookies()
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  // Settings is not offered to a viewer at all, so the dialog never opens; the server reads the domain to them and refuses the rest.
  await page.goto(`${API}/settings?site=${site.id}&tab=site`)
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: /^Settings for/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0)
  expect(((await (await page.request.get(`${API}/api/v1/sites/${site.id}/domain`, { headers: H })).json()) as { domain: string }).domain).toBe(site.domain)
  const refused = await page.request.put(`${API}/api/v1/sites/${site.id}/domain`, { headers: H, data: { domain: 'viewer-moved.example.org' } })
  expect(refused.status()).toBe(403)
})
