// Settings → Alerts → Client reports: add a report for a client (rhythm,
// language, PDF, addresses), see it in the list, change it, switch it off,
// have the test button wait for a mail server, and delete it with a question.
// Also the pictures for the review: POLISH_SHOTS=<folder> saves them.
import { expect, test, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const SHOTS = process.env.POLISH_SHOTS
const SCHEME = process.env.POLISH_SCHEME === 'dark' ? 'dark' : 'light'
const WIDTH = Number(process.env.POLISH_WIDTH ?? 0)
test.use({ colorScheme: SCHEME, ...(WIDTH ? { viewport: { width: WIDTH, height: 844 } } : {}) })
const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('client-reports')
})

async function open(page: Page) {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `reports-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.example` } })
  expect(made.status()).toBe(201)
  const { id: site, domain } = (await made.json()) as { id: string; domain: string }
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  await page.request.post(`${API}/api/e`, { headers: { 'Content-Type': 'text/plain', 'User-Agent': ua }, data: JSON.stringify({ s: site, k: 'pv', u: `https://${domain}/`, r: '', w: 1400 }) })
  await expect.poll(async () => ((await (await page.request.get(`${API}/api/v1/sites`)).json()).sites as { id: string; last_event_at?: number }[]).find((x) => x.id === site)?.last_event_at ?? 0, { timeout: 15_000 }).toBeGreaterThan(0)
  await page.goto(`${API}/settings?site=${site}&tab=alerts`)
  return site
}

test('add, change, switch off and delete a client report', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for this card')
  const site = await open(page)
  const card = page.getByRole('region', { name: 'Client reports' })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.getByText('No reports yet')).toBeVisible()
  // This server has no mail server: the card says what is missing, and the test button waits.
  await expect(card.getByText(/TRCKABLE_SMTP_URL/)).toBeVisible()

  await card.getByRole('button', { name: 'Add a report' }).click()
  await card.getByLabel('For').fill('Acme GmbH')
  await card.getByRole('button', { name: 'Monthly' }).click()
  await card.getByLabel('Language').selectOption('de')
  await card.getByLabel('Addresses').fill('client@example.com\nteam@example.com, client@example.com')
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/client-reports-form-${SCHEME}-${WIDTH || 'desktop'}.png` })
  await card.getByRole('button', { name: 'Save' }).click()

  const row = card.locator('.rp-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Acme GmbH')
  await expect(row).toContainText('Monthly · Deutsch · PDF · 2 addresses')
  await expect(row.getByRole('button', { name: /Send me a test/ })).toBeDisabled()
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/client-reports-list-${SCHEME}-${WIDTH || 'desktop'}.png` })

  const got = async () => ((await (await page.request.get(`${API}/api/v1/sites/${site}/report-schedules`)).json()) as { schedules: { cadence: string; lang: string; enabled: boolean; recipients: string[]; pdf: boolean }[] }).schedules
  expect(await got()).toMatchObject([{ cadence: 'monthly', lang: 'de', enabled: true, pdf: true, recipients: ['client@example.com', 'team@example.com'] }])

  // Change it: weekly, in French, no PDF.
  await row.getByRole('button', { name: /^Edit/ }).click()
  await card.getByRole('button', { name: 'Weekly' }).click()
  await card.getByLabel('Language').selectOption('fr')
  await card.getByRole('switch', { name: 'Attach a PDF' }).click()
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('Weekly · Français · 2 addresses')

  // Off, and the row dims.
  await row.getByRole('switch', { name: 'Acme GmbH' }).click()
  await expect(row).toHaveClass(/off/)
  await expect.poll(async () => (await got())[0]?.enabled).toBe(false)

  // Too many addresses: the count says so and Save waits.
  await row.getByRole('button', { name: /^Edit/ }).click()
  await card.getByLabel('Addresses').fill(Array.from({ length: 11 }, (_, i) => `p${i}@example.com`).join('\n'))
  await expect(card.getByRole('button', { name: 'Save' })).toBeDisabled()
  await card.getByRole('button', { name: 'Cancel' }).click()

  // Delete asks first.
  await row.getByRole('button', { name: /^Delete/ }).click()
  const ask = page.getByRole('dialog', { name: 'Delete “Acme GmbH”?' })
  await expect(ask).toContainText('Delete “Acme GmbH”?')
  await ask.getByRole('button', { name: 'Delete' }).click()
  await expect(card.getByText('No reports yet')).toBeVisible()
  expect(await got()).toEqual([])
})
