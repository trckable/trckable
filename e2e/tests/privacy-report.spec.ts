// The privacy report: Settings → Data & privacy → Privacy report opens a sheet
// that states what the site is set to collect, and it follows the settings.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }

test('privacy report: the sheet reads the site\'s real settings', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the report is plain text')
  await context.addCookies([{ name: 'trckable_session', value: await session('privacy-report'), url: API }])
  const domain = `report-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  const site = ((await made.json()) as { id: string }).id

  await page.goto(`${API}/settings?site=${site}&tab=privacy`)
  await page.locator('#privacy-report').getByRole('button', { name: 'View' }).click()
  const sheet = page.getByRole('dialog', { name: `Privacy report: ${domain}` })
  await expect(sheet).toContainText('trckable_vid')
  await expect(sheet).toContainText('Yes. This site sets a cookie')
  await expect(sheet).toContainText('This is not legal advice')
  await expect(sheet).toContainText(`## Analytics on ${domain}`)
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)

  // Cookieless mode changes what the report says.
  const cur = (await (await page.request.get(`${API}/api/v1/sites/${site}/config`, { headers: H })).json()) as Record<string, unknown>
  await page.request.put(`${API}/api/v1/sites/${site}/config`, { headers: H, data: { ...cur, consent_free: true } })
  await page.goto(`${API}/settings?site=${site}&tab=privacy`)
  await page.locator('#privacy-report').getByRole('button', { name: 'View' }).click()
  await expect(page.getByRole('dialog', { name: `Privacy report: ${domain}` })).toContainText('Usually not')
})
