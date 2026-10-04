// The look of a site's share links, from Share → Link: a logo, a colour, the
// "Hide trckable branding" switch and a domain; then the link, opened by
// someone with no account, wears it. An SVG with script in it is refused.
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

// POLISH_SHOTS=<folder> saves the pictures for the review (POLISH_SCHEME=dark, POLISH_WIDTH=390).
const SHOTS = process.env.POLISH_SHOTS
const SCHEME = process.env.POLISH_SCHEME === 'dark' ? 'dark' : 'light'
const WIDTH = Number(process.env.POLISH_WIDTH ?? 0)
test.use({ colorScheme: SCHEME, ...(WIDTH ? { viewport: { width: WIDTH, height: 844 } } : {}) })
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 12"><rect width="40" height="12" fill="#336699"/></svg>'
const EVIL = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('share-look')
})

test('a link wears the owner\'s logo and colour, and hides trckable\'s name', async ({ page, browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for the look')
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `look-${Date.now()}.example`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.status()).toBe(201)
  const { id: site } = (await made.json()) as { id: string }
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  await page.request.post(`${API}/api/e`, { headers: { 'Content-Type': 'text/plain', 'User-Agent': ua }, data: JSON.stringify({ s: site, k: 'pv', u: `https://${domain}/`, r: '', w: 1400 }) })
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites`)).json()).sites as { id: string; last_event_at?: number }[]).find((x) => x.id === site)?.last_event_at ?? 0, { timeout: 15_000 }).toBeGreaterThan(0)

  await page.goto(`${API}/${domain}`)
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  if (WIDTH && WIDTH <= 640) {
    // On a phone Share is in ⋯.
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: /Share/ }).click()
  } else await page.locator('.subbar').getByRole('button', { name: 'Share' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share your numbers' })
  await dialog.locator('.sd-linkbtn').click()
  const look = dialog.locator('.sd-look')
  await expect(look).toBeVisible()

  // A logo with script in it is refused, and says so; a clean one is kept.
  await look.locator('input[type=file]').setInputFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(EVIL) })
  await expect(look.locator('.sd-logo')).toHaveCount(0)
  await look.locator('input[type=file]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(LOGO) })
  await expect(look.locator('.sd-logo')).toBeVisible()

  await look.locator('#sd-colour').fill('#336699')
  await look.getByRole('switch', { name: 'Hide trckable branding' }).click()
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites/${site}/share-look`)).json()) as { color: string; hide_brand: boolean }).hide_brand).toBe(true)
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites/${site}/share-look`)).json()) as { color: string }).color).toBe('#336699')

  // A domain: a bad one is told, a good one asks for its TXT record.
  const field = look.getByLabel('Domain')
  await field.fill('https://reports.example.com')
  await field.press('Enter')
  await expect(page.getByRole('alert').or(page.locator('.toast')).first()).toBeVisible()
  await field.fill(`reports-${Date.now()}.example.com`)
  await field.press('Enter')
  await expect(look.locator('.sd-cname')).toContainText(/_trckable\.reports-\d+\.example\.com TXT trckable-verify=/)
  await expect(look.getByRole('button', { name: 'Check' })).toBeVisible()

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/share-look-dialog-${SCHEME}-${WIDTH || 'desktop'}.png` })

  // The link, opened with no account.
  await dialog.getByRole('button', { name: 'Create link' }).click()
  const url = await dialog.locator('.sd-url input').inputValue()
  const path = new URL(url).pathname
  const anon = await browser.newContext({ colorScheme: SCHEME, ...(WIDTH ? { viewport: { width: WIDTH, height: 844 } } : {}) })
  const shared = await anon.newPage()
  await shared.goto(`${API}${path}`)
  await expect(shared.locator('.share-logo')).toBeVisible({ timeout: 15_000 })
  await expect(shared.locator('.tkb-logo')).toHaveCount(0)
  await expect(shared.locator('.share-credit')).toHaveCount(0)
  expect(await shared.locator('.app.shared').evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim())).toBe('#336699')
  // The logo is fetched from this server, as a picture, under a policy that runs nothing.
  const logo = await shared.request.get(`${API}/api/v1/share/logo`)
  expect(logo.headers()['content-security-policy']).toContain("default-src 'none'")
  if (SHOTS) await shared.screenshot({ path: `${SHOTS}/share-look-page-${SCHEME}-${WIDTH || 'desktop'}.png` })
  await anon.close()
})
