// The foot of the dashboard is one quiet line: it says the server is fine, links
// the version, and Feedback sends a note the owner can read back.
import { expect, test } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('footer')
})

test('the footer shows the server is fine, and Feedback sends a note', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `footer-${Date.now()}.example.org` } })
  expect(made.ok()).toBe(true)
  await page.goto(`${API}/`)

  const foot = page.locator('footer.app-footer')
  await expect(foot.getByText('All systems normal')).toBeVisible()
  await expect(foot.getByRole('link', { name: /^v\d/ })).toHaveAttribute('href', /changelog/)

  const note = `Footer note ${Date.now()}`
  await foot.getByRole('button', { name: 'Feedback' }).click()
  const dialog = page.getByRole('dialog', { name: 'Feedback' })
  await dialog.getByRole('textbox', { name: 'Your feedback' }).fill(note)
  await dialog.getByRole('button', { name: 'Send' }).click()
  await expect(dialog).toBeHidden()

  const read = await page.request.get(`${API}/api/v1/admin/feedback`)
  const list = ((await read.json()) as { feedback: { message: string }[] }).feedback
  expect(list.map((f) => f.message)).toContain(note)
})
