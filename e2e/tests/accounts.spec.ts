// One person in two accounts: a viewer who joined a team (seeded through the
// store's tables, since no product route does it yet) switches to it from the
// site switcher, sees only the sites the team allows, keeps the account on
// reload, is taken to another account's site by a link, and leaves.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { API } from '../playwright.config'
import { seedTeam, type Team } from './accounts'

const BIN = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/bin/trckabled')
const PASSWORD = 'accounts e2e password 1'
const SHOTS = process.env.MEMBERSHIPS_SHOTS

let cookie = ''
let team: Team
let home = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const email = `member-${tag}@example.com`
  for (let i = 0; ; i++) {
    try {
      execFileSync(BIN, ['admin', 'add-user', email, '--role', 'viewer'], { input: PASSWORD + '\n', env: process.env, stdio: ['pipe', 'ignore', 'ignore'] })
      break
    } catch (e) {
      if (i >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  // Two sites in the team; the viewer may see only the first.
  team = await seedTeam(email, tag, [`alpha-${tag}.example`, `beta-${tag}.example`], [0])
  const res = await fetch(API + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  cookie = /trckable_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? ''
  expect(res.ok && cookie).toBeTruthy()
})

const me = async (request: import('@playwright/test').APIRequestContext, account?: string) =>
  (await (await request.get(`${API}/api/v1/me`, { headers: account ? { 'X-Trckable-Account': account } : {} })).json()) as { account: string; role: string; accounts: { id: string; name: string; role: string; total: number }[] }

test('joins a team as a viewer, switches to it, sees only its allowed sites, and leaves', async ({ page, context }) => {
  test.slow()
  const request = context.request
  await context.addCookies([{ name: 'trckable_session', value: cookie, url: API }])
  const person = await me(request)
  expect(person.accounts).toHaveLength(2)
  home = person.accounts.find((a) => a.id !== team.account)!.id
  // The team lists only what the viewer may see, and names its first owner.
  const card = person.accounts.find((a) => a.id === team.account)!
  expect(card).toMatchObject({ name: team.owner, role: 'viewer', total: 1 })

  // Their own account opens first (nothing remembered, the oldest where they are).
  await page.goto(`${API}/example.com`)
  const pick = page.locator('.site-pick .site-btn')
  await expect(pick).toBeVisible()
  // The header names the account in view, for a person in two.
  await expect.poll(() => pick.locator('.name').evaluate((el) => getComputedStyle(el, '::before').content)).not.toMatch(/^(none|normal)$/)

  await pick.click()
  const menu = page.getByRole('dialog', { name: 'Sites' })
  await expect(menu).toBeVisible()
  const section = menu.getByRole('button', { name: `${team.owner} · Viewer · 1 site` })
  await expect(section).toHaveAttribute('aria-expanded', 'false')
  await expect(menu.getByText(team.sites[0].domain)).toHaveCount(0) // folded
  await section.click()
  await expect(menu.getByRole('button', { name: team.sites[0].domain })).toBeVisible()
  await expect(menu.getByText(team.sites[1].domain)).toHaveCount(0) // not allowed
  if (SHOTS) {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/switcher-${page.viewportSize()?.width ?? 0}-dark.png` })
  }

  // Picking the team's site moves the tab to the team.
  await menu.getByRole('button', { name: team.sites[0].domain }).click()
  await expect(page).toHaveURL(new RegExp(`/${team.sites[0].domain}$`))
  await expect(pick).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('trckable:account'))).toBe(team.account)
  // A reload keeps it.
  await page.reload()
  await expect(page).toHaveURL(new RegExp(`/${team.sites[0].domain}$`))
  await expect(pick.locator('.name')).toContainText(team.sites[0].domain)
  // The server remembers it for a new tab.
  expect((await me(request)).account).toBe(team.account)

  // Only the allowed site exists for them: the other is not found, here or by id.
  expect((await request.get(`${API}/api/v1/sites/${team.sites[1].id}`)).status()).toBe(404)
  expect((await request.get(`${API}/api/v1/sites/${team.sites[0].id}`)).status()).toBe(200)
  await pick.click()
  const inTeam = page.getByRole('dialog', { name: 'Sites' })
  await expect(inTeam.getByText(team.sites[1].domain)).toHaveCount(0)
  // Their own account is now one of the other sections.
  await expect(inTeam.getByRole('button', { name: /· Viewer · \d+ sites?$/ })).toBeVisible()
  await page.keyboard.press('Escape')

  // A link to a site of the other account wins over where the tab was.
  const fresh = await context.newPage()
  await fresh.goto(`${API}/example.com`)
  await expect(fresh.locator('.site-pick .site-btn .name')).toContainText('example.com')
  expect(await fresh.evaluate(() => sessionStorage.getItem('trckable:account'))).toBe(home)
  await fresh.close()

  // Leaving: Account → Shared with you → Leave. The tab falls back to their own account.
  await page.goto(`${API}/${team.sites[0].domain}?account=profile`)
  const leave = page.locator('.acct-line', { hasText: team.owner }).getByRole('button', { name: 'Leave' })
  await expect(leave).toBeVisible({ timeout: 15_000 })
  await leave.click()
  await page.getByRole('dialog', { name: `Leave ${team.owner}?` }).getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL(`${API}/example.com`, { timeout: 15_000 })
  const after = await me(request)
  expect(after.accounts).toHaveLength(1)
  expect(after.account).toBe(home)
  expect((await request.get(`${API}/api/v1/sites/${team.sites[0].id}`)).status()).toBe(404)
  // A tab that still names the team is told so, and starts over.
  const stale = await request.get(`${API}/api/v1/sites`, { headers: { 'X-Trckable-Account': team.account } })
  expect(stale.status()).toBe(403)
  expect((await stale.json()).code).toBe('not_member')
  await pick.click()
  await expect(page.getByRole('dialog', { name: 'Sites' }).getByText(team.owner)).toHaveCount(0)
})
