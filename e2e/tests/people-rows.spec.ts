// People, one compact row per person: a sites button with a popover (search,
// a tick per site, saved at once), a role pill whose popover only ever asks,
// and a confirmation for every role change: a new owner needs one tick,
// a viewer is a plain confirm. Keyboard in and out, and a sheet on a phone.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { API } from '../playwright.config'
import { session } from './session'

const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const email = `rows-${tag}@example.com`
const name = `rows-${tag}`
let AUTH: Record<string, string> = {}
let personId = ''
let sitesTotal = 0

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  AUTH = { Cookie: 'trckable_session=' + (await session('people-rows')), 'X-Trckable-Request': '1', 'Content-Type': 'application/json' }
  // Three sites of their own, so there is something to choose between.
  for (const n of ['a', 'b', 'c']) await request.post(`${API}/api/v1/sites`, { headers: AUTH, data: { domain: `rows-${n}-${tag}.example` } })
  const made = await (await request.post(`${API}/api/v1/people`, { headers: AUTH, data: { email, role: 'viewer' } })).json()
  personId = made.person.id
})

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'trckable_session', value: await session('people-rows'), url: API }])
})

async function open(page: Page) {
  await page.goto(API + '/example.com?account=people')
  const window = page.getByRole('dialog', { name: 'Profile, your account' })
  const row = window.locator('.person', { hasText: email })
  await expect(row).toBeVisible({ timeout: 15_000 })
  return { window, row, sites: row.locator('button.sites-btn'), pill: row.locator('button.role-pill') }
}

const stored = async (page: Page) => {
  const list = await (await page.request.get(`${API}/api/v1/site-access`, { headers: AUTH })).json()
  sitesTotal = list.sites.length
  return list.viewers.find((v: { id: string }) => v.id === personId).sites as string[] | null
}

test('the sites popover ticks, searches and saves at once', async ({ page }) => {
  const { row, sites } = await open(page)
  await expect(row.locator('.sites-btn .sites-text')).toHaveText('All sites')
  await sites.click()
  const pop = page.locator('.sites-pop')
  const boxes = pop.getByRole('menuitemcheckbox')
  await expect(boxes.first()).toBeVisible()
  const all = await boxes.count()
  expect(all).toBeGreaterThanOrEqual(3)
  for (const b of await boxes.all()) await expect(b).toHaveAttribute('aria-checked', 'true')

  // Unticking one saves: the server has every site but that one.
  await pop.getByRole('menuitemcheckbox', { name: new RegExp(`rows-a-${tag}`) }).click()
  await expect(pop.getByRole('menuitemcheckbox', { name: new RegExp(`rows-a-${tag}`) })).toHaveAttribute('aria-checked', 'false')
  await expect.poll(async () => (await stored(page))?.length).toBe(all - 1)
  await expect(row.locator('.sites-btn .sites-text')).toHaveText(`${all - 1} of ${all} sites`)

  // A search narrows the list, and the tick still works on what is left.
  await pop.getByLabel('Find a site').fill(`rows-b-${tag}`)
  await expect(boxes).toHaveCount(1)
  await pop.getByLabel('Find a site').fill('')
  await expect(boxes).toHaveCount(all)

  // All sites: no limit again.
  await pop.getByRole('button', { name: 'All sites' }).click()
  await expect.poll(() => stored(page)).toBeNull()
  await expect(row.locator('.sites-btn .sites-text')).toHaveText('All sites')
  await pop.getByRole('button', { name: 'Done' }).click()
  await expect(pop).toHaveCount(0)
  await expect(sites).toBeFocused()
})

test('fast ticks are saved one at a time, and the newest state wins', async ({ page }) => {
  const { row, sites } = await open(page)
  await stored(page)
  const all = sitesTotal
  // The first save is held for a moment; the next two ticks come while it is out.
  let puts = 0
  await page.route('**/api/v1/site-access/*', async (route) => {
    if (route.request().method() === 'PUT' && puts++ === 0) await new Promise((r) => setTimeout(r, 1200))
    await route.continue()
  })
  await sites.click()
  const pop = page.locator('.sites-pop')
  await pop.getByRole('menuitemcheckbox', { name: new RegExp(`rows-a-${tag}`) }).click()
  await pop.getByRole('menuitemcheckbox', { name: new RegExp(`rows-b-${tag}`) }).click()
  await page.waitForTimeout(2000)
  expect(await stored(page)).toHaveLength(all - 2)
  await expect(row.locator('.sites-btn .sites-text')).toHaveText(`${all - 2} of ${all} sites`)
  await page.unroute('**/api/v1/site-access/*')
  await pop.getByRole('button', { name: 'All sites' }).click()
  await expect.poll(() => stored(page)).toBeNull()
})

test('keyboard: in with Enter, arrows between the choices, Escape back to the button', async ({ page }) => {
  const { row, sites, pill } = await open(page)
  await sites.focus()
  await page.keyboard.press('Enter')
  const pop = page.locator('.sites-pop')
  await expect(pop.getByLabel('Find a site')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(pop.getByRole('menuitemcheckbox').first()).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(pop.getByLabel('Find a site')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)
  await expect(sites).toBeFocused()
  // Escape closed the popover alone: the account window is still there.
  await expect(page.getByRole('dialog', { name: 'Profile, your account' })).toBeVisible()

  await pill.focus()
  await page.keyboard.press('Enter')
  const roles = page.locator('.role-pop')
  await expect(roles.getByRole('menuitemradio', { checked: true })).toBeFocused()
  await expect(roles.getByRole('menuitemradio')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(roles).toHaveCount(0)
  await expect(pill).toBeFocused()
  await expect(row).toBeVisible()
})

test('a role change never applies directly; a new owner needs one tick', async ({ page }) => {
  const { pill } = await open(page)
  await expect(pill).toHaveText('Viewer')
  await pill.click()
  await page.getByRole('menuitemradio', { name: /^Owner/ }).click()
  const ask = page.getByRole('dialog', { name: `Make ${name} an owner?` })
  await expect(ask).toBeVisible()
  // Nothing changed yet, and nothing is typed: one tick.
  await expect(pill).toHaveText('Viewer')
  await expect(ask.getByRole('textbox')).toHaveCount(0)
  const go = ask.getByRole('button', { name: 'Make owner' })
  const tick = ask.getByRole('checkbox', { name: 'I trust them with all of this' })
  await expect(go).toBeDisabled()
  await expect(tick).toBeFocused()
  await expect(tick).toHaveAttribute('aria-checked', 'false')
  // Focus stays inside the dialog however far Tab goes.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    expect(await ask.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
  // Escape cancels, and focus is back on the pill.
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(pill).toBeFocused()
  await expect(pill).toHaveText('Viewer')

  await pill.click()
  await page.getByRole('menuitemradio', { name: /^Owner/ }).click()
  await tick.click()
  await expect(tick).toHaveAttribute('aria-checked', 'true')
  await expect(go).toBeEnabled()
  await page.keyboard.press('Space') // unticks
  await expect(go).toBeDisabled()
  await page.keyboard.press('Space')
  await expect(go).toBeEnabled()
  await page.keyboard.press('Enter')
  await expect(ask).toHaveCount(0)
  await expect(page.getByText(`${name} is now an owner`)).toBeVisible()
  await expect(pill).toHaveText('Owner')
})

test('making an owner a viewer is one plain confirmation', async ({ page }) => {
  const { row, pill } = await open(page)
  await expect(pill).toHaveText('Owner')
  // An owner is not limited: their sites read as all, and are not a button.
  await expect(row.locator('.sites-btn.plain .sites-text')).toHaveText('All sites')
  await pill.click()
  await page.getByRole('menuitemradio', { name: /^Viewer/ }).click()
  const ask = page.getByRole('dialog', { name: `Make ${name} a viewer?` })
  await expect(ask).toBeVisible()
  await expect(ask.getByRole('checkbox')).toHaveCount(0)
  const go = ask.getByRole('button', { name: 'Make viewer' })
  await expect(go).toBeEnabled()
  await go.click()
  await expect(page.getByText(`${name} is now a viewer`)).toBeVisible()
  await expect(pill).toHaveText('Viewer')
  await expect(row.locator('button.sites-btn')).toBeVisible()
})

test('the last owner cannot change their own role: the pill is off and says why', async ({ page, request }) => {
  const me = (await (await request.get(`${API}/api/v1/me`, { headers: AUTH })).json()).email as string
  // Other suites add owners of their own: show the list as if there were only this one.
  await page.route('**/api/v1/people', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const res = await route.fetch()
    const body = await res.json()
    body.people = body.people.filter((p: { role: string; email: string }) => p.role !== 'owner' || p.email === me)
    return route.fulfill({ response: res, json: body })
  })
  const { window } = await open(page)
  const mine = window.locator('.person.self button.role-pill')
  await expect(mine).toBeDisabled()
  await expect(mine).toHaveText('Owner')
  await expect(window.locator('.person.self .role-wrap')).toHaveAttribute('title', /only owner/i)
})

for (const scheme of ['dark', 'light'] as const) {
  test(`WCAG 2.1 AA on the rows, both popovers and both confirmations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const { row, sites, pill } = await open(page)
    const scan = async (where: string) => {
      await page.waitForTimeout(300)
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.tkb-able').analyze() // the logotype is exempt (1.4.3)
      expect(violations.flatMap((v) => v.nodes.map((n) => `${where}: ${v.id} ${n.html.slice(0, 120)}`))).toEqual([])
    }
    await scan('rows')
    await sites.click()
    await scan('sites popover')
    await page.keyboard.press('Escape')
    await pill.click()
    await scan('role popover')
    await page.getByRole('menuitemradio', { name: /^Owner/ }).click()
    await scan('make owner')
    await page.keyboard.press('Escape')
    // The other way: as an owner, the viewer confirmation.
    await page.request.patch(`${API}/api/v1/people/${personId}`, { headers: AUTH, data: { role: 'owner' } })
    await open(page)
    await pill.click()
    await page.getByRole('menuitemradio', { name: /^Viewer/ }).click()
    await scan('make viewer')
    await page.keyboard.press('Escape')
    await page.request.patch(`${API}/api/v1/people/${personId}`, { headers: AUTH, data: { role: 'viewer' } })
    await expect(row).toBeVisible()
  })
}

async function noOverflow(page: Page, where: Locator) {
  expect(await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth)).toBe(true)
  expect(await where.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
}

test('at 390 px: two lines per person, comfortable buttons, sheets from the bottom, no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { window, row, sites, pill } = await open(page)
  await noOverflow(page, window.locator('.window-body'))
  for (const b of [sites, pill]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43)
  // The identity is on top; the sites, the role and ⋯ on the line under it.
  const top = (await row.locator('.person-text').boundingBox())!
  const under = [sites, pill, row.getByRole('button', { name: `${email} options` })]
  for (const b of under) expect((await b.boundingBox())!.y).toBeGreaterThan(top.y + top.height - 1)

  await sites.click()
  const sheet = page.locator('.sites-pop')
  await expect(sheet).toBeVisible()
  const box = (await sheet.boundingBox())!
  expect(box.x).toBe(0)
  expect(box.width).toBe(390)
  expect(Math.round(box.y + box.height)).toBe(844)
  await noOverflow(page, window.locator('.window-body'))
  await page.keyboard.press('Escape')
  await pill.click()
  const roles = page.locator('.role-pop')
  await expect(roles).toBeVisible()
  expect(Math.round((await roles.boundingBox())!.y + (await roles.boundingBox())!.height)).toBe(844)
  await page.keyboard.press('Escape')
  await expect(roles).toHaveCount(0)
})
