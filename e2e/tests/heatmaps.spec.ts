// Heatmaps without recording anyone: what a visitor types is never sent. A page
// with a sign-up form is opened with the module on, someone fills in every
// field (a password too), clicks around and leaves; everything the browser
// sent to trckable in the meantime is read, and none of it holds a typed
// value. Field names go (that is the point); values, never.
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const TYPED = ['ada@lovelace.example', 'hunter2hunter2', 'Ada Lovelace', 'Analytical Engines Ltd', '4111111111111111']
let cookie = ''
test.beforeAll(async () => {
  cookie = await session('heatmaps')
})

test('what is typed is never sent: field names are, values never', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `heat-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id
  const on = await page.request.put(`${API}/api/v1/sites/${site}/modules/heatmaps`, { headers: H, data: { enabled: true } })
  expect(on.ok()).toBe(true)

  // The site's own script is the base script with the heatmaps module after it.
  const script = await (await page.request.get(`${API}/js/${site}.js`)).text()
  expect(script).toContain('focusin') // the module is in it: only it listens for fields

  const sent: { url: string; body: string }[] = []
  page.on('request', (r) => sent.push({ url: r.url(), body: r.postData() ?? '' }))
  const answers: number[] = []
  page.on('response', (r) => r.url().endsWith('/api/h') && answers.push(r.status()))
  // The suite's site serves a sign-up form that carries this site's own script, as a local page (data-dev).
  await page.goto(`/heat/${site}/signup`)
  await page.locator('.join').click()
  await page.locator('.card').click()
  await page.fill('[name=email]', TYPED[0])
  await page.fill('[name=secret]', TYPED[1])
  await page.fill('[name=full_name]', TYPED[2])
  await page.fill('[name=company]', TYPED[3])
  await page.fill('[name=card]', TYPED[4])
  await page.locator('.join').click()
  // Leave with the form half done: the page is hidden, which is when the batch goes.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
  })
  await expect.poll(() => answers.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(answers.every((s) => s === 202)).toBe(true)

  const heat = sent.filter((r) => r.url.endsWith('/api/h'))
  expect(heat.length).toBeGreaterThan(0)
  const body = heat.map((r) => r.body).join('\n')
  // It saw the page, the clicks and the form, by name…
  for (const seen of ['["v"]', 'button.join', 'signup>email', 'signup>company']) expect(body, seen).toContain(seen)
  // …and the form it was left at, but not the password's name, and never a value.
  expect(body).toContain('"fd","signup>card"')
  expect(body).not.toContain('secret')
  // Nothing the browser sent anywhere, to trckable or not, carries what was typed.
  for (const r of sent)
    for (const value of TYPED) {
      expect(r.url, `${r.url} carries ${value}`).not.toContain(encodeURIComponent(value))
      expect(r.body, `${r.url} carries ${value}`).not.toContain(value)
    }
  // And it keeps nothing in the browser.
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, cookie: document.cookie.replace(/trckable_vid=[^;]*;?/, '') }))
  expect(storage).not.toMatch(/heat|signup|email/i)
})

test('the module is off for a new site: its script is the base script alone', async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain: `noheat-${Date.now()}.example.org` } })
  const site = ((await made.json()) as { id: string }).id
  const script = await (await page.request.get(`${API}/js/${site}.js`)).text()
  expect(script).not.toContain('focusin')
  expect(script.length).toBeLessThan(6000)
  const heat = await page.request.post(`${API}/api/h`, { data: { s: site, u: `https://noheat.example.org/`, w: 1280, h: 900, i: [['v']] } })
  expect(heat.status()).toBe(202) // answered and ignored
})
