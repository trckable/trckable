// Settings → Widgets: "a small card for the site's own pages. The card runs no
// script and sets no cookie; only the numbers its design shows are public."
// Each design is made in the dialog, then followed to the page that is pasted
// into a customer's site: what it says, what it must not do, the on switch,
// the code Copy gives, delete. The privacy seal is held to its own claim:
// every line it prints is a setting of the site as it is right now.
import { expect, test, type Locator, type Page } from './fixtures'
import { API } from '../playwright.config'
import { H, newSite, openSettings, visit, waitForEvents, type TestSite } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

type Widget = { id: string; name: string; kind: string; on: boolean }
const widgets = async (page: Page, site: TestSite) => ((await (await page.request.get(`${API}/api/v1/sites/${site.id}/widgets`, { headers: H })).json()) as { widgets: Widget[] }).widgets

/** The page a widget is, as a customer's visitor gets it. */
const shown = (page: Page, id: string) => page.request.get(`${API}/w/${id}`)

async function make(page: Page, design: string, tweak?: (studio: Locator) => Promise<void>) {
  await page.getByRole('button', { name: 'New widget' }).first().click()
  const studio = page.getByRole('dialog', { name: 'New widget' })
  await studio.getByRole('radio', { name: design }).click()
  if (tweak) await tweak(studio)
  await studio.getByRole('button', { name: 'Make this widget' }).click()
  await expect(studio.getByRole('button', { name: 'Done' })).toBeVisible()
  const code = await studio.locator('pre, code').first().innerText()
  await studio.getByRole('button', { name: 'Done' }).click()
  return code
}

const DESIGNS: { design: string; says: RegExp }[] = [
  { design: 'Live now', says: /Visitors in the last 30 minutes/ },
  { design: 'Online', says: /online/i },
  { design: 'Last 7 days', says: /visitors in the last 7 days/ },
  { design: 'Counter', says: /in the last 30 min/ },
  { design: 'Open revenue', says: /Revenue in /i },
  { design: 'Privacy seal', says: /How .* measures visits/ },
]

test('every design: made in the dialog, its page runs no script and sets no cookie, the switch turns it off and on, delete ends it', async ({ page, context }) => {
  test.setTimeout(180_000)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: API })
  const site = await newSite(page, 'widgets')
  await page.request.put(`${API}/api/v1/sites/${site.id}/modules/revenue`, { headers: H, data: { enabled: true } })
  await openSettings(page, site, 'widgets')
  await expect(page.getByText('No widgets yet')).toBeVisible()

  for (const { design, says } of DESIGNS) {
    const before = (await widgets(page, site)).map((w) => w.id)
    const code = await make(page, design)
    const fresh = (await widgets(page, site)).filter((w) => !before.includes(w.id))
    expect(fresh, `${design} made`).toHaveLength(1)
    const w = fresh[0]
    // The code shown names this widget's page, and that page is there.
    expect(code, `${design}: the code to paste`).toContain(`/w/${w.id}`)
    const res = await shown(page, w.id)
    expect(res.status(), design).toBe(200)
    const body = await res.text()
    expect(body, `${design} says what it is`).toMatch(says)
    expect(res.headers()['set-cookie'], `${design} sets a cookie`).toBeUndefined()
    // The page carries one fixed script of the server's own, to fit its frame; nothing else runs.
    expect(body.match(/<script/gi) ?? [], `${design} runs more than the fit script`).toHaveLength(1)
    expect(body, `${design} loads a script from elsewhere`).not.toMatch(/<script[^>]*\ssrc=/i)

    // Its row: named for its design; Copy code gives the iframe for this page.
    const row = page.locator('.wg-row', { hasText: w.name }).first()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Copy embed code' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/w/${w.id}`)

    // Off: its page answers not found, empty, so a page that still embeds it shows a quiet space.
    await row.getByRole('switch', { name: `${w.name} on` }).click()
    await expect.poll(async () => (await shown(page, w.id)).status(), { message: `${design} off` }).toBe(404)
    expect(await (await shown(page, w.id)).text()).toBe('<!doctype html><title></title>')
    await row.getByRole('switch', { name: `${w.name} on` }).click()
    await expect.poll(async () => (await shown(page, w.id)).status(), { message: `${design} on again` }).toBe(200)
  }

  // Delete ends one of them, and only that one.
  const all = await widgets(page, site)
  expect(all).toHaveLength(DESIGNS.length)
  const victim = all[0]
  const row = page.locator('.wg-row', { hasText: victim.name }).first()
  await row.getByRole('button', { name: 'Widget menu' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: 'Delete this widget?' }).getByRole('button', { name: 'Delete' }).click()
  await expect.poll(async () => (await widgets(page, site)).length).toBe(DESIGNS.length - 1)
  expect((await shown(page, victim.id)).status()).toBe(404)
  expect((await shown(page, all[1].id)).status()).toBe(200)
})

test('theme, brand and language chosen in the dialog are what the page is', async ({ page }) => {
  const site = await newSite(page, 'widgetlook')
  await openSettings(page, site, 'widgets')
  await make(page, 'Last 7 days', async (studio) => {
    await studio.getByRole('button', { name: /^Look/ }).click()
    await studio.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click()
    await studio.getByRole('group', { name: 'Corners' }).locator('button', { hasText: /^Square$/ }).click()
    await studio.getByRole('button', { name: /^Language & texts/ }).click()
    await studio.getByRole('combobox', { name: 'Language' }).selectOption('de')
    await studio.getByRole('button', { name: /^Brand/ }).click()
    await studio.getByRole('switch', { name: 'Show "Counted by trckable"' }).click()
  })
  const [w] = await widgets(page, site)
  const body = await (await shown(page, w.id)).text()
  expect(body).toMatch(/data-theme="dark"/)
  expect(body).toContain('Besucher')
  expect(body).not.toContain('Counted by trckable')
  expect(body).toMatch(/border-radius:\s*4px/) // Square
})

test('numbers: the live design shows the people who are here, and nothing else about them', async ({ page }) => {
  const site = await newSite(page, 'widgetlive')
  expect((await visit(page.request, site, '/pricing', { id: 'w2' })).status()).toBe(202)
  await waitForEvents(page.request, site, 2)
  await openSettings(page, site, 'widgets')
  await make(page, 'Live now')
  const [w] = await widgets(page, site)
  const body = await (await shown(page, w.id)).text()
  expect(body).not.toContain('/pricing') // "Reading now" names only pages with three or more people on them: one visitor is not named
  expect(body).not.toMatch(/k3j2/) // never a visitor id
  expect(body).not.toContain(site.id)
})

test('Privacy seal: every line it prints is a setting of the site right now, and no line it does not earn', async ({ page }) => {
  test.setTimeout(120_000)
  const site = await newSite(page, 'seal')
  await openSettings(page, site, 'widgets')
  await make(page, 'Privacy seal')
  const [w] = await widgets(page, site)
  const config = async () => (await (await page.request.get(`${API}/api/v1/sites/${site.id}/config`, { headers: H })).json()) as Record<string, unknown>
  const set = async (patch: Record<string, unknown>) => {
    const res = await page.request.put(`${API}/api/v1/sites/${site.id}/config`, { headers: H, data: { ...(await config()), ...patch } })
    expect(res.ok(), JSON.stringify(patch)).toBe(true)
  }
  const lines = async () => {
    const html = await (await shown(page, w.id)).text()
    return html.replace(/<[^>]+>/g, '\n').split('\n').map((s) => s.trim()).filter((s) => /^(No IP|No cookies|A cookie|One first|Location|Do Not Track|Visits (kept|deleted)|Never sold)/.test(s))
  }

  expect(await lines()).toEqual(['No IP addresses stored', 'One first-party cookie, never used for ads', 'Location: country and city', 'Visits kept until the site deletes them', 'Never sold, never used for advertising'])
  await set({ record_city: false, honor_dnt: true, retention_days: 90 })
  await expect.poll(lines, { message: 'country only, DNT, 3 months' }).toEqual(['No IP addresses stored', 'One first-party cookie, never used for ads', 'Location: country only', 'Do Not Track respected', 'Visits deleted after 3 months', 'Never sold, never used for advertising'])
  await set({ retention_days: 365 })
  await expect.poll(lines).toContain('Visits deleted after 1 year')
  await set({ retention_days: 45 })
  await expect.poll(lines).toContain('Visits deleted after 45 days')
  await set({ consent_free: true, retention_days: 0 })
  await expect.poll(lines, { message: 'cookieless' }).toEqual(['No IP addresses stored', 'No cookies: nothing is stored in your browser', 'Location: country only', 'Do Not Track respected', 'Visits kept until the site deletes them', 'Never sold, never used for advertising'])
  // Asking first: a cookie after the visitor agrees.
  await set({ consent_free: false, record_city: true, honor_dnt: false })
  await page.request.put(`${API}/api/v1/sites/${site.id}/modules/consent`, { headers: H, data: { enabled: true } })
  await expect.poll(lines).toContain('A cookie only after you agree')
})
