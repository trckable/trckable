// Settings → Alerts, end to end with a real mail server to receive them: the
// destination, "Send a test", each switch and number saved where the alert
// checker reads them, the weekly email, and a client report carrying the
// site's display name. The server is a trckabled of this suite's own (the
// shared one has no mail server), and the mailbox is a few lines of SMTP.
import { expect, test, type Page } from './fixtures'
import { readMail, startMailbox, startServer, UA, type Mailbox, type OwnServer } from './audit-kit'

test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough: the server does the work')

let box: Mailbox
let srv: OwnServer
// The session cookie (set per page by newSite) signs the calls: an API key reads reports only.
const J = () => ({ 'X-Trckable-Request': '1', 'Content-Type': 'application/json' })

test.beforeAll(async () => {
  box = await startMailbox()
  srv = await startServer(box.port)
})
test.afterAll(async () => {
  await srv?.stop()
  await box?.close()
})

async function newSite(page: Page, prefix: string) {
  await page.context().addCookies([{ name: 'trckable_session', value: srv.cookie, url: srv.url }])
  const domain = `${prefix}-${Date.now()}.example.org`
  const made = await page.request.post(`${srv.url}/api/v1/sites`, { headers: J(), data: { domain } })
  expect(made.status()).toBe(201)
  const site = { id: ((await made.json()) as { id: string }).id, domain }
  const pv = await page.request.post(`${srv.url}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site.id, k: 'pv', u: `https://${domain}/`, id: `a${Date.now()}`, v: `k3j2.${Date.now()}` } })
  expect(pv.ok()).toBe(true)
  await expect.poll(async () => ((await (await page.request.get(`${srv.url}/api/v1/sites/${site.id}/events?limit=1`, { headers: J() })).json()) as { events: unknown[] }).events.length, { timeout: 15_000 }).toBe(1)
  return site
}

const alertsOf = async (page: Page, site: { id: string }) =>
  (await (await page.request.get(`${srv.url}/api/v1/sites/${site.id}/alerts`, { headers: J() })).json()) as { mail: boolean; alerts: { id: string; kind: string; enabled: boolean; target: string; threshold: number }[] }

test('a test goes to the address typed, through the mail server, and says what it is', async ({ page }) => {
  const site = await newSite(page, 'alerttest')
  await page.goto(`${srv.url}/settings?site=${site.id}&tab=alerts`)
  const where = page.getByRole('textbox', { name: 'Where to send alerts' })
  await where.fill('owner@example.com')
  const before = box.messages.length
  await page.getByRole('button', { name: 'Send a test' }).click()
  await expect(page.getByRole('button', { name: 'Delivered' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Delivered at' })).toBeVisible()
  await expect.poll(() => box.messages.length).toBe(before + 1)
  const mail = readMail(box.messages[before])
  expect(mail.to).toContain('owner@example.com')
  expect(mail.subject).toBe(`trckable is connected · ${site.domain}`)
  expect(mail.body).toContain('This is what an alert looks like.')

  // An address nobody can take mail at is said so, with what to do about it.
  await where.fill('not an address')
  await page.getByRole('button', { name: 'Send a test' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'The test was not delivered' })).toBeVisible()
  // A webhook inside the network is refused whatever it is called.
  await where.fill('https://127.0.0.1/hook')
  await page.getByRole('button', { name: /Send a test|Try again/ }).click()
  await expect(page.getByRole('region', { name: 'Alerts' }).getByRole('alert')).toContainText('The test was not delivered')
  expect(box.messages.length).toBe(before + 1)
})

test('each alert: its switch and its number are saved where the checker reads them, and moved with the destination', async ({ page }) => {
  const site = await newSite(page, 'alertrows')
  await page.goto(`${srv.url}/settings?site=${site.id}&tab=alerts`)
  const where = page.getByRole('textbox', { name: 'Where to send alerts' })
  // No destination: the switches wait, so nothing can be on that goes nowhere. A new site starts with the owner's address, so it is cleared first.
  await where.fill('')
  await where.blur()
  await expect(page.getByRole('switch', { name: 'Tracking stopped' })).toBeDisabled()
  await where.fill('first@example.com')
  await where.blur()

  const KINDS: [string, string][] = [
    ['Tracking stopped', 'stopped'],
    ['Busy day', 'spike'],
    ['Traffic surge', 'surge'],
    ['Someone paid', 'customer'],
    ['Disk filling up', 'disk'],
    ['Weekly report', 'weekly'],
    ['Milestone reached', 'milestone'],
  ]
  for (const [label, kind] of KINDS) {
    // A new site starts with some alerts already on: only the ones that are off are switched.
    const sw = page.getByRole('switch', { name: label })
    if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click()
    await expect.poll(async () => (await alertsOf(page, site)).alerts.find((a) => a.kind === kind)?.enabled, { message: `${label} on` }).toBe(true)
  }
  const on = (await alertsOf(page, site)).alerts
  expect(on.map((a) => a.kind).sort()).toEqual(KINDS.map((k) => k[1]).sort())
  expect(on.every((a) => a.target === 'mailto:first@example.com')).toBe(true)

  // The numbers sit inside the sentence they change, and are kept.
  const hours = page.getByRole('textbox', { name: 'Tracking stopped threshold in hours' })
  await hours.fill('12')
  await hours.blur()
  await expect.poll(async () => (await alertsOf(page, site)).alerts.find((a) => a.kind === 'stopped')?.threshold).toBe(12)
  const times = page.getByRole('textbox', { name: /^Busy day threshold/ })
  await times.fill('5')
  await times.blur()
  await expect.poll(async () => (await alertsOf(page, site)).alerts.find((a) => a.kind === 'spike')?.threshold).toBe(5)
  const days = page.getByRole('textbox', { name: /^Disk filling up threshold/ })
  await days.fill('30')
  await days.blur()
  await expect.poll(async () => (await alertsOf(page, site)).alerts.find((a) => a.kind === 'disk')?.threshold).toBe(30)

  // A new destination moves every alert that is set up.
  await where.fill('second@example.com')
  await where.blur()
  await expect.poll(async () => (await alertsOf(page, site)).alerts.every((a) => a.target === 'mailto:second@example.com')).toBe(true)
  // Off is off.
  await page.getByRole('switch', { name: 'Busy day' }).click()
  await expect.poll(async () => (await alertsOf(page, site)).alerts.find((a) => a.kind === 'spike')?.enabled).toBe(false)
  expect((await alertsOf(page, site)).alerts.find((a) => a.kind === 'stopped')?.threshold).toBe(12)
})

test('"Send me this week\'s email now": the report arrives in the owner\'s mailbox, named for the site', async ({ page }) => {
  const site = await newSite(page, 'weeklynow')
  await page.goto(`${srv.url}/settings?site=${site.id}&tab=alerts`)
  await page.getByRole('textbox', { name: 'Where to send alerts' }).fill('owner@example.com')
  await page.getByRole('textbox', { name: 'Where to send alerts' }).blur()
  await page.getByRole('switch', { name: 'Weekly report' }).click()
  const before = box.messages.length
  await page.getByRole('button', { name: 'Send me this week’s email now' }).click()
  await expect(page.getByText(/^Sent to /).first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => box.messages.length).toBe(before + 1)
  const mail = readMail(box.messages[before])
  expect(mail.subject).toContain(site.domain)
  expect(mail.body).toContain(site.domain)
  expect(mail.body).toMatch(/unsubscribe|Stop this email|Alerts/i)
})

test('Display name reaches a client report\'s email', async ({ page }) => {
  const site = await newSite(page, 'namemail')
  const patch = await page.request.patch(`${srv.url}/api/v1/sites/${site.id}`, { headers: J(), data: { name: 'The Bridge Bakery' } })
  expect(patch.ok()).toBe(true)
  const made = await page.request.post(`${srv.url}/api/v1/sites/${site.id}/report-schedules`, { headers: J(), data: { name: 'For the bakery', cadence: 'weekly', lang: 'en', pdf: false, recipients: ['client@example.com'], enabled: true } })
  expect(made.status()).toBeLessThan(300)
  const { id } = (await made.json()) as { id: string }
  // The test button of a report is only for a signed-in person: the page's own session.
  await page.goto(`${srv.url}/settings?site=${site.id}&tab=alerts`)
  const before = box.messages.length
  const sent = await page.request.post(`${srv.url}/api/v1/sites/${site.id}/report-schedules/${id}/test`, { headers: { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' } })
  expect(sent.status(), await sent.text()).toBeLessThan(300)
  await expect.poll(() => box.messages.length, { timeout: 20_000 }).toBeGreaterThan(before)
  const mail = readMail(box.messages[before])
  expect(`${mail.subject}\n${mail.body}`).toContain('The Bridge Bakery')
})
