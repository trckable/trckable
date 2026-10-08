// Leaving your own visits out. The avatar menu opens the site with the
// tracker's own flag (?trckable=ignore, then ?trckable=track to undo), and
// Settings → Data & privacy → Exclude IP ranges drops visits from your own
// addresses before anything is counted. A site of its own, so no other suite's
// counts move.
import { expect, test, type Page } from './fixtures'
import { API } from '../playwright.config'
import { session } from './session'

const H = { 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const SHOTS = process.env.EXCLUDE_SHOTS

let cookie = ''
test.beforeAll(async () => {
  cookie = await session('exclude')
})

const paths = async (page: Page, site: string) => {
  const res = await page.request.get(`${API}/api/v1/sites/${site}/events?limit=50`, { headers: H })
  return ((await res.json()) as { events: { path: string }[] }).events.map((e) => e.path).sort()
}
const visit = (page: Page, site: string, domain: string, path: string, id: string) =>
  page.request.post(`${API}/api/e`, { headers: { 'User-Agent': UA }, data: { s: site, k: 'pv', u: `https://${domain}${path}`, id, v: `k3j2.${id}` } })

test('exclude my visits: the menu opens the site with the flag, and the IP list drops visits before counting', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'one browser is enough: the server does the work')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const domain = `own-${Date.now()}.example.org`
  const made = await page.request.post(`${API}/api/v1/sites`, { headers: H, data: { domain } })
  expect(made.ok()).toBe(true)
  const site = ((await made.json()) as { id: string }).id
  expect((await visit(page, site, domain, '/first', 'aaaa1')).ok()).toBe(true)
  await expect.poll(() => paths(page, site), { timeout: 15_000 }).toEqual(['/first'])

  // The menu: neutral wording, then the way back. The site itself is not
  // reachable from here, so the tab it opens is answered by the test.
  const flags: string[] = []
  await context.route(`https://${domain}/**`, (route) => {
    flags.push(route.request().url())
    return route.fulfill({ contentType: 'text/html', body: '<title>site</title>' })
  })
  await page.goto(`${API}/${domain}?view=data`)
  const avatar = page.getByRole('button', { name: 'Account', exact: true })
  await avatar.click()
  const menu = page.getByRole('menu', { name: 'Account' })
  const leave = menu.getByRole('menuitem', { name: 'Exclude this browser' })
  await expect(leave).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/exclude-menu-1280-dark.png` })
  const opened = context.waitForEvent('page')
  await leave.click()
  const tab = await opened
  await tab.waitForLoadState()
  expect(tab.url()).toBe(`https://${domain}/?trckable=ignore`)
  await tab.close()

  await avatar.click()
  await menu.getByRole('menuitem', { name: 'Count this browser again' }).click({ trial: true })
  const back = context.waitForEvent('page')
  await menu.getByRole('menuitem', { name: 'Count this browser again' }).click()
  const tab2 = await back
  await tab2.waitForLoadState()
  expect(tab2.url()).toBe(`https://${domain}/?trckable=track`)
  await tab2.close()
  expect(flags).toEqual([`https://${domain}/?trckable=ignore`, `https://${domain}/?trckable=track`])

  // The settings field: a typo is said where it is made, and nothing is saved.
  await page.goto(`${API}/settings?site=${site}&tab=privacy`)
  const field = page.getByRole('textbox', { name: 'Exclude IP ranges' })
  await field.scrollIntoViewIfNeeded()
  await field.fill('203.0.113.7\nnot-an-address')
  await field.blur()
  await expect(page.getByText('“not-an-address” isn’t an IP address')).toBeVisible()
  const cfg = () => page.request.get(`${API}/api/v1/sites/${site}/config`).then((r) => r.json() as Promise<{ exclude_ips: string[] | null }>)
  expect((await cfg()).exclude_ips ?? []).toEqual([])

  // This test's own address (the browser and the test run on this machine).
  await field.fill('127.0.0.1\n10.0.0.0/8\n2001:db8::/32')
  await field.blur()
  await expect(page.getByText('3 addresses excluded')).toBeVisible()
  expect((await cfg()).exclude_ips).toEqual(['127.0.0.1', '10.0.0.0/8', '2001:db8::/32'])
  if (SHOTS) {
    await page.goto(`${API}/settings?site=${site}&tab=privacy`) // the toasts of the steps above are gone
    await expect(field).toHaveValue('127.0.0.1\n10.0.0.0/8\n2001:db8::/32')
    await field.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/exclude-ips-1280-dark.png` })
  }

  // A visit from the excluded address is accepted as any is, and never counted.
  const excluded = await visit(page, site, domain, '/excluded', 'bbbb2')
  expect(excluded.status()).toBe(202)

  // Take the list away: the same address counts again. The control visit
  // arriving proves the excluded one, sent earlier, was dropped, not late.
  await field.fill('')
  await field.blur()
  await expect(page.getByText('No addresses are excluded now')).toBeVisible()
  expect((await visit(page, site, domain, '/control', 'cccc3')).status()).toBe(202)
  await expect.poll(() => paths(page, site), { timeout: 15_000 }).toEqual(['/control', '/first'])
})
